/**
 * Caphlon — Skill store & learning index.
 *
 * Caphlon'un "aynı modeli daha iyi yapan" katmanı. Yeni bir model çalıştırmaz;
 * modele görev anında ilgili *skill*'leri (Claude-style SKILL.md) bağlam olarak
 * enjekte eder. Bu, aider / opencode / open-design gibi gerçek araçlara giden
 * promptu zenginleştirir → aynı modelin çıktısındaki farkı artırır.
 *
 * No-rewrite ilkesi: skill'ler GitHub repolarından `git` ile çekilir (kendi
 * indirme protokolümüzü yazmayız), Open Design gibi alt projelerin taşıdığı
 * skill'ler kaynak olarak indekslenir (kopya değil, referans).
 *
 * Yerleşim (CAPHLON_HOME ile override):
 *   ~/.caphlon/skills/<source>/.../SKILL.md   GitHub/yerelden eklenen skill'ler
 *   ~/.caphlon/skills/learned/<slug>/SKILL.md Görevlerden çıkarılan dersler
 *   ~/.caphlon/skills/registry.json           kaynak repo listesi (sync için)
 *
 * Ay sonu: registry.json + learned/ bir GitHub reposuna push edilecek
 * (caphlon skill sync). Şimdilik tamamen yereldir.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { join, basename, relative } from 'node:path';
import { caphlonHome } from './store.js';

export interface Skill {
  /** Stable id: kaynak-göreli yol, ör. "anthropics-skills/pdf/SKILL.md" */
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  /** SKILL.md'nin tam yolu (aider --read / bağlam enjeksiyonu için) */
  path: string;
  /** İçeren klasör (script/asset'ler burada) */
  dir: string;
  /** Üst kaynak: "learned" | repo/dizin adı */
  source: string;
  /** Frontmatter'dan sonraki gövde (arama için) */
  body: string;
}

interface RegistryEntry {
  source: string;
  origin: string; // github url | local path
  addedAt: string; // ISO; çağıran taraf damgalar
}

interface Registry {
  v: 1;
  sources: RegistryEntry[];
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function skillsHome(): string {
  return join(caphlonHome(), 'skills');
}

export function learnedHome(): string {
  return join(skillsHome(), 'learned');
}

function registryPath(): string {
  return join(skillsHome(), 'registry.json');
}

function ensureSkillsHome(): string {
  const dir = skillsHome();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

// ---------------------------------------------------------------------------
// SKILL.md parsing (Claude-style frontmatter)
// ---------------------------------------------------------------------------

interface ParsedSkill {
  name: string;
  description: string;
  whenToUse: string;
  body: string;
}

/** Minimal YAML-frontmatter parser (key: value satırları, çok satırlı değil). */
function parseSkillMd(raw: string, fallbackName: string): ParsedSkill {
  let name = fallbackName;
  let description = '';
  let whenToUse = '';
  let body = raw;

  const fm = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (fm) {
    body = fm[2];
    const lines = fm[1].split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase().replace(/-/g, '_');
      let val = m[2].trim();
      // YAML blok-scalar (| veya >): sonraki girintili satırları topla.
      if (val === '|' || val === '>' || val === '|-' || val === '>-') {
        const collected: string[] = [];
        while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) {
          collected.push(lines[++i].trim());
        }
        val = collected.join(' ');
      } else {
        val = val.replace(/^["']|["']$/g, '');
      }
      if (key === 'name') name = val || name;
      else if (key === 'description') description = val;
      else if (key === 'when_to_use' || key === 'whentouse') whenToUse = val;
    }
  }
  // Açıklama yoksa gövdenin ilk anlamlı satırını kullan.
  if (!description) {
    const firstLine = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    description = firstLine ?? '';
  }
  return { name, description, whenToUse, body };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/** Bir dizin ağacında tüm SKILL.md dosyalarını bul (node_modules/.git atlanır). */
function findSkillFiles(root: string, acc: string[] = []): string[] {
  if (!existsSync(root)) return acc;
  for (const entry of readdirSync(root)) {
    // node_modules ve tüm nokta-dizinleri (.git, .sync-repo aynası, …) atla.
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(root, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) findSkillFiles(full, acc);
    else if (/^skill\.md$/i.test(entry)) acc.push(full);
  }
  return acc;
}

function toSkill(path: string): Skill {
  const dir = path.slice(0, path.length - basename(path).length - 1);
  const rel = relative(skillsHome(), path);
  const source = rel.split(/[\\/]/)[0] || 'local';
  const parsed = parseSkillMd(readFileSync(path, 'utf8'), basename(dir));
  return {
    id: rel,
    name: parsed.name,
    description: parsed.description,
    whenToUse: parsed.whenToUse,
    path,
    dir,
    source,
    body: parsed.body,
  };
}

/** Yerel tüm skill'leri (eklenen + learned) listele. */
export function listSkills(): Skill[] {
  return findSkillFiles(skillsHome()).map(toSkill);
}

// ---------------------------------------------------------------------------
// Relevance & injection — "aynı modeli güçlendiren" çekirdek
// ---------------------------------------------------------------------------

const STOP = new Set([
  've', 'ile', 'bir', 'bu', 'the', 'a', 'an', 'to', 'of', 'for', 'and', 'in', 'on',
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-zçğıöşü0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !STOP.has(t),
  );
}

/** Bir görev promptuna en alakalı skill'leri puanla ve döndür. */
export function selectRelevant(prompt: string, limit = 4): Skill[] {
  const q = new Set(tokenize(prompt));
  if (q.size === 0) return [];
  const scored = listSkills().map((sk) => {
    const hay = tokenize(`${sk.name} ${sk.description} ${sk.whenToUse}`);
    let score = 0;
    for (const t of hay) if (q.has(t)) score++;
    // whenToUse eşleşmesine ekstra ağırlık
    for (const t of tokenize(sk.whenToUse)) if (q.has(t)) score++;
    return { sk, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.sk);
}

/** Görev için enjekte edilecek SKILL.md yollarını ver (aider --read vb.). */
export function skillContextPaths(prompt: string, limit = 4): string[] {
  return selectRelevant(prompt, limit).map((s) => s.path);
}

/**
 * AKTİF skill enjeksiyonu: göreve uygun top-K SKILL.md'nin TAM içeriğini görev
 * promptuna önden ekler. A/B testi gösterdi ki zayıf model skill indeksini KENDİ
 * açmıyor; tam içeriği prompt'a gömünce gerçekten uygular. Hiç skill yoksa görevi
 * aynen döndürür. `caphlon max` ve `caphlon compose` ortak kullanır.
 */
export function buildSkillPreamble(
  task: string,
  opts: { limit?: number; maxChars?: number } = {},
): { prompt: string; used: string[] } {
  const limit = opts.limit ?? 3;
  const maxChars = opts.maxChars ?? 9000;
  const skills = selectRelevant(task, limit);
  if (skills.length === 0) return { prompt: task, used: [] };
  let budget = maxChars;
  const blocks: string[] = [];
  const used: string[] = [];
  for (const s of skills) {
    let body: string;
    try {
      body = readFileSync(s.path, 'utf8');
    } catch {
      continue;
    }
    if (body.length > budget) body = body.slice(0, budget) + '\n…(kısaltıldı)';
    budget -= body.length;
    blocks.push(`### Skill: ${s.name}\n${body}`);
    used.push(s.name);
    if (budget <= 0) break;
  }
  const prompt =
    `Aşağıdaki kanıtlanmış skill(ler)i bu görevde UYGULA (sadece okuma — talimatlarını izle):\n\n` +
    blocks.join('\n\n---\n\n') +
    `\n\n---\n\nGÖREV:\n${task}`;
  return { prompt, used };
}

// ---------------------------------------------------------------------------
// Index — TUI (OpenCode) yüzeyine enjeksiyon
// ---------------------------------------------------------------------------

/**
 * Tüm skill'lerin hafif bir indeksini Markdown olarak üret. OpenCode TUI bunu
 * `instructions` ile bağlama alır; model gerektiğinde tam SKILL.md'yi (yol verili)
 * kendi read aracıyla açar. Claude-style "skill" deseninin TUI karşılığı budur.
 * `writeSkillsIndex` üretip dosyaya yazar ve yolu döndürür.
 */
export function renderSkillsIndex(): string {
  const skills = listSkills();
  const lines: string[] = [
    '# Caphlon Skills',
    '',
    `Bu makinede ${skills.length} skill mevcut. Bir göreve uygun olduğunda,`,
    'aşağıdaki yoldan tam SKILL.md dosyasını OKU ve talimatlarını uygula.',
    'Skill\'ler aynı modeli daha iyi yapan, kanıtlanmış yöntem/şablonlardır.',
    '',
  ];
  const bySource = new Map<string, Skill[]>();
  for (const s of skills) {
    if (!bySource.has(s.source)) bySource.set(s.source, []);
    bySource.get(s.source)!.push(s);
  }
  for (const [source, group] of bySource) {
    lines.push(`## ${source}`, '');
    for (const s of group) {
      const desc = (s.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      const when = (s.whenToUse || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      lines.push(`- **${s.name}** — ${desc}`);
      if (when) lines.push(`  - Ne zaman: ${when}`);
      lines.push(`  - Oku: \`${s.path}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** İndeksi verilen dizine SKILLS_INDEX.md olarak yaz; yolu döndür (skill yoksa null). */
export function writeSkillsIndex(destDir: string): string | null {
  if (listSkills().length === 0) return null;
  const path = join(destDir, 'SKILLS_INDEX.md');
  writeFileSync(path, renderSkillsIndex() + '\n');
  return path;
}

// ---------------------------------------------------------------------------
// Add skills — GitHub (git shell-out) / yerel
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'skill';
}

function loadRegistry(): Registry {
  const p = registryPath();
  if (!existsSync(p)) return { v: 1, sources: [] };
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Registry;
  } catch {
    return { v: 1, sources: [] };
  }
}

function saveRegistry(reg: Registry): void {
  ensureSkillsHome();
  writeFileSync(registryPath(), JSON.stringify(reg, null, 2), { mode: 0o600 });
}

export interface AddResult {
  source: string;
  dest: string;
  skillCount: number;
}

/**
 * Bir GitHub repo URL'sini (veya owner/repo kısayolunu) skill kaynağı olarak
 * ekle. Kendi indirme kodumuzu yazmaz; `git clone --depth 1` shell-out eder.
 * `addedAt` çağıran taraftan gelir (deterministik test/sync için).
 */
export function addFromGit(repo: string, addedAt: string): AddResult {
  ensureSkillsHome();
  const url = /^https?:\/\/|git@/.test(repo) ? repo : `https://github.com/${repo}.git`;
  // Kaynak adı owner-repo (çakışmayı önler): "anthropics/skills" → "anthropics-skills",
  // URL'den de son iki segmenti al.
  const segs = url
    .replace(/\.git$/, '')
    .replace(/^git@[^:]+:/, '')
    .split(/[/:]/)
    .filter(Boolean);
  const ownerRepo = segs.slice(-2).join('-') || basename(repo);
  const source = slugify(ownerRepo);
  const dest = join(skillsHome(), source);

  // Yeniden ekleme = tazeleme: var olan dizini temizle (git clone boş dizin ister).
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });

  const res = spawnSync('git', ['clone', '--depth', '1', url, dest], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`git clone başarısız: ${url}`);
  }

  const count = findSkillFiles(dest).length;
  const reg = loadRegistry();
  reg.sources = reg.sources.filter((s) => s.source !== source);
  reg.sources.push({ source, origin: url, addedAt });
  saveRegistry(reg);
  return { source, dest, skillCount: count };
}

/** Yerel bir dizini skill kaynağı olarak kopyala. */
export function addFromPath(srcPath: string, addedAt: string): AddResult {
  ensureSkillsHome();
  if (!existsSync(srcPath)) throw new Error(`Yol bulunamadı: ${srcPath}`);
  const source = slugify(basename(srcPath));
  const dest = join(skillsHome(), source);
  cpSync(srcPath, dest, { recursive: true });
  const count = findSkillFiles(dest).length;
  const reg = loadRegistry();
  reg.sources = reg.sources.filter((s) => s.source !== source);
  reg.sources.push({ source, origin: srcPath, addedAt });
  saveRegistry(reg);
  return { source, dest, skillCount: count };
}

// ---------------------------------------------------------------------------
// Learning loop — görevden çıkan dersi sakla (MiMo MEMORY.md deseni)
// ---------------------------------------------------------------------------

export interface Learning {
  title: string;
  description: string;
  whenToUse: string;
  body: string;
  createdAt: string; // ISO; çağıran damgalar
}

/** Bir dersi learned/<slug>/SKILL.md olarak yaz; oluşturulan yolu döndür. */
export function recordLearning(l: Learning): string {
  const dir = join(learnedHome(), slugify(l.title));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const md =
    `---\n` +
    `name: ${l.title}\n` +
    `description: ${l.description}\n` +
    `when_to_use: ${l.whenToUse}\n` +
    `created_at: ${l.createdAt}\n` +
    `source: learned\n` +
    `---\n\n` +
    `${l.body}\n`;
  const path = join(dir, 'SKILL.md');
  writeFileSync(path, md, { mode: 0o600 });
  return path;
}

// ---------------------------------------------------------------------------
// Sync — öğrenilen skill'leri bir git reposuna push/pull (no-rewrite: git shell-out)
// ---------------------------------------------------------------------------

export interface SyncStatus {
  skillsHome: string;
  totalSkills: number;
  learnedCount: number;
  sources: RegistryEntry[];
  remote: string | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
}

interface SyncState {
  remote: string | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
}

function syncStatePath(): string {
  return join(skillsHome(), 'sync.json');
}

function loadSyncState(): SyncState {
  const p = syncStatePath();
  if (!existsSync(p)) return { remote: null, lastPushAt: null, lastPullAt: null };
  try {
    return { remote: null, lastPushAt: null, lastPullAt: null, ...JSON.parse(readFileSync(p, 'utf8')) };
  } catch {
    return { remote: null, lastPushAt: null, lastPullAt: null };
  }
}

function saveSyncState(s: SyncState): void {
  ensureSkillsHome();
  writeFileSync(syncStatePath(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

/**
 * Uzak depo tanımlayıcısını git'in anlayacağı bir hedefe çevir.
 * - Tam URL / SSH / file: → olduğu gibi
 * - Yerel yol (/, ./, ~, veya diskte var olan) → olduğu gibi (GitHub'a SAPMAZ)
 * - Tam olarak `owner/repo` kısayolu → https://github.com/owner/repo.git
 */
function normalizeRemote(repo: string): string {
  if (/^(https?|ssh|git|file):/.test(repo) || repo.startsWith('git@')) return repo;
  if (repo.startsWith('/') || repo.startsWith('.') || repo.startsWith('~')) return repo;
  if (existsSync(repo)) return repo;
  if (/^[^/]+\/[^/]+$/.test(repo)) return `https://github.com/${repo}.git`;
  return repo; // tanınmayan biçim: git'e olduğu gibi bırak
}

/** Sync için yerel ayna klon dizini (~/.caphlon/skills/.sync-repo). */
function syncRepoDir(): string {
  return join(skillsHome(), '.sync-repo');
}

function git(args: string[], cwd?: string): { status: number; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** Sync'in üzerinde çalıştığı kanonik dal. Push/pull hep bunu kullanır. */
const SYNC_BRANCH = 'main';

/**
 * Yerel aynayı uzak repoyla `main` dalında hizala. Farklı git sürümlerinde
 * bare repo varsayılan HEAD'i (main/master) değişebildiğinden, dal adına GÜVENMEZ:
 * remote-tracking ref'lerden (origin/main → origin/master) içeriği bulur ve daima
 * yerel `main`'e taşır. Boş uzak repoda doğmamış `main` ile başlar.
 */
function ensureSyncMirror(remote: string): string {
  ensureSkillsHome();
  const dir = syncRepoDir();

  // Doğru remote'a bağlı taze bir klon değilse baştan kur.
  const haveRepo = existsSync(join(dir, '.git'));
  const sameRemote =
    haveRepo && git(['remote', 'get-url', 'origin'], dir).stdout.trim() === remote;
  if (!sameRemote) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    if (git(['init'], dir).status !== 0) throw new Error('git init başarısız');
    git(['remote', 'add', 'origin', remote], dir);
  }

  // Uzaktaki tüm ref'leri getir (boş repoda sessizce başarısız olabilir).
  git(['fetch', 'origin'], dir);

  // İçeriği olan uzak dalı bul ve yerel `main`'e baz al; yoksa doğmamış main.
  let base: string | null = null;
  for (const ref of [`origin/${SYNC_BRANCH}`, 'origin/master']) {
    if (git(['rev-parse', '--verify', ref], dir).status === 0) {
      base = ref;
      break;
    }
  }
  if (base) {
    git(['checkout', '-B', SYNC_BRANCH, base], dir);
  } else {
    // Boş uzak: doğmamış HEAD'i main'e işaretle (henüz commit yok).
    git(['symbolic-ref', 'HEAD', `refs/heads/${SYNC_BRANCH}`], dir);
  }
  return dir;
}

export interface SyncPushResult {
  remote: string;
  pushed: number; // gönderilen learned skill sayısı
  changed: boolean; // değişiklik var mıydı
}

/**
 * Öğrenilen skill'leri (learned/) uzak git reposuna gönder. Akış:
 * mirror'ı senkron al → learned/'i kopyala → commit → push. Hiç değişiklik
 * yoksa commit/push yapmaz (changed=false). `at` çağıran taraftan (deterministik).
 */
export function syncPush(repoArg: string | undefined, at: string): SyncPushResult {
  const state = loadSyncState();
  const remote = repoArg ? normalizeRemote(repoArg) : state.remote;
  if (!remote) {
    throw new Error('Uzak depo tanımlı değil. Bir kez verin:  caphlon skill sync push <owner/repo>');
  }

  const dir = ensureSyncMirror(remote);

  // learned/ → mirror/learned/ (aynala: yereldeki silmeleri de yansıt)
  const mirrorLearned = join(dir, 'learned');
  rmSync(mirrorLearned, { recursive: true, force: true });
  const learned = learnedHome();
  const count = existsSync(learned) ? findSkillFiles(learned).length : 0;
  if (existsSync(learned)) cpSync(learned, mirrorLearned, { recursive: true });

  git(['add', '-A'], dir);
  const status = git(['status', '--porcelain'], dir);
  if (status.stdout.trim() === '') {
    saveSyncState({ ...state, remote, lastPushAt: at });
    return { remote, pushed: count, changed: false };
  }

  const commit = git(['commit', '-m', `caphlon skill sync: ${count} learned skill @ ${at}`], dir);
  if (commit.status !== 0) {
    throw new Error(`commit başarısız:\n${commit.stderr.trim() || commit.stdout.trim()}`);
  }

  // Daima kanonik dala push et (ensureSyncMirror bizi main'e taşıdı).
  const push = git(['push', '-u', 'origin', SYNC_BRANCH], dir);
  if (push.status !== 0) {
    throw new Error(
      `git push başarısız (kimlik/erişim?):\n${push.stderr.trim()}\n` +
        '  İpucu: gh auth login  ·  ya da SSH/token erişimi olan bir remote kullanın.',
    );
  }

  saveSyncState({ ...state, remote, lastPushAt: at });
  return { remote, pushed: count, changed: true };
}

export interface SyncPullResult {
  remote: string;
  pulled: number; // uzaktan gelen learned skill sayısı
}

/**
 * Uzak repodaki learned/ skill'lerini yerele getir (merge — yerelde olup
 * uzakta olmayanı SİLMEZ; çakışan id'de uzak kazanır). `at` çağıran damgalar.
 */
export function syncPull(repoArg: string | undefined, at: string): SyncPullResult {
  const state = loadSyncState();
  const remote = repoArg ? normalizeRemote(repoArg) : state.remote;
  if (!remote) {
    throw new Error('Uzak depo tanımlı değil. Bir kez verin:  caphlon skill sync pull <owner/repo>');
  }

  const dir = ensureSyncMirror(remote);
  const mirrorLearned = join(dir, 'learned');
  if (!existsSync(mirrorLearned)) {
    saveSyncState({ ...state, remote, lastPullAt: at });
    return { remote, pulled: 0 };
  }

  // Birleştir: uzak learned/'i yerele kopyala (cpSync üzerine yazar = uzak kazanır).
  const learned = learnedHome();
  mkdirSync(learned, { recursive: true });
  cpSync(mirrorLearned, learned, { recursive: true });
  const pulled = findSkillFiles(mirrorLearned).length;

  saveSyncState({ ...state, remote, lastPullAt: at });
  return { remote, pulled };
}

export function syncStatus(): SyncStatus {
  const all = listSkills();
  const state = loadSyncState();
  return {
    skillsHome: skillsHome(),
    totalSkills: all.length,
    learnedCount: all.filter((s) => s.source === 'learned').length,
    sources: loadRegistry().sources,
    remote: state.remote,
    lastPushAt: state.lastPushAt,
    lastPullAt: state.lastPullAt,
  };
}

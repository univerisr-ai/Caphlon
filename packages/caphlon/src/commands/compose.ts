/**
 * caphlon compose — Compose mode, gerçek MiMo Code ile.
 *
 * MiMo Code'u (Bun tabanlı, opencode-fork) sıfırdan yazmaz; indirilen gerçek
 * projeyi (MiMo-Code-main) `compose` ajanıyla başlatır ve `caphlon connect` ile
 * bağlı modeli ortam değişkenleriyle geçirir. MiMo'nun "en iyi yanı" — kalıcı
 * hafıza + 8-aşamalı specs-driven compose workflow — buradan kullanılır.
 *
 *   caphlon compose start "<açıklama>"   Compose ajanını bu görevle başlat
 *   caphlon compose list                  Aşamaları göster
 *   caphlon compose resume [session]      Son oturuma (--continue) ya da verilen
 *                                         oturuma (--session <id>) GERÇEKTEN devam et
 *   caphlon compose runs                  Kalıcı workflow koşularını listele (journal)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import {
  getActiveModel,
  getJudgeModel,
  activeModelEnv,
  judgeModelEnv,
  opencodeModelString,
} from '../config/active.js';
import { findBun, firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';
import { buildSkillPreamble } from '../config/skills.js';

const COMPOSE_STAGES = [
  { name: 'brainstorm', emoji: '💡', desc: 'Gereksinim analizi & spesifikasyon' },
  { name: 'spec',       emoji: '📝', desc: 'Teknik spesifikasyon & görev dökümü' },
  { name: 'implement',  emoji: '🔨', desc: 'Kod yaz & test ekle' },
  { name: 'review',     emoji: '👁️',  desc: 'Kod incelemesi & kalite kontrol' },
  { name: 'tdd',        emoji: '🧪', desc: 'Test-driven development' },
  { name: 'debug',      emoji: '🐛', desc: 'Hata ayıkla & düzelt' },
  { name: 'verify',     emoji: '✅', desc: 'Typecheck, test, lint, build' },
  { name: 'merge',      emoji: '🔀', desc: 'Değişiklikleri birleştir & temizle' },
];

/** İndirilen MiMo Code dizinini bul. */
function findMimoDir(): string | null {
  return firstExisting(
    join(projectRoot(), 'MiMo-Code-main'),
    join(projectRoot(), 'core', 'MiMo-Code-main'),
  );
}

/** Gerçek MiMo'yu nasıl başlatacağımıza karar ver: PATH binary → bundled (Bun). */
export function resolveMimoLauncher(): { cmd: string; baseArgs: string[]; cwd?: string } | null {
  // 1. Kurulu `mimo` (npm i -g @mimo-ai/cli)
  if (onPath('mimo')) return { cmd: 'mimo', baseArgs: [] };

  // 2. Bundled kaynak: MiMo'nun kendi dev çağrısını birebir aynala.
  const dir = findMimoDir();
  const bun = findBun();
  if (dir && bun && firstExisting(join(dir, 'packages', 'opencode', 'script', 'dev.ts'))) {
    return { cmd: bun, baseArgs: ['run', '--cwd', 'packages/opencode', 'script/dev.ts'], cwd: dir };
  }
  return null;
}

export async function composeCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'start':
      await handleComposeStart(args);
      break;
    case 'list':
      handleComposeList();
      break;
    case 'resume': {
      // Gerçek devam: MiMo'nun kendi bayrakları (thread.ts): --session <id>
      // verilen oturuma, --continue en son root oturuma döner (bağlam dahil).
      const session = args[0]?.trim();
      await launchMimo(session ? ['--session', session] : ['--continue'], 'compose');
      break;
    }
    case 'runs':
      handleComposeRuns();
      break;
    default:
      showComposeHelp();
  }
}

// ---------------------------------------------------------------------------
// Workflow koşusu görünürlüğü (kesinti sonrası "kısmi çıktı nerede?" cevabı)
// ---------------------------------------------------------------------------

/**
 * MiMo'nun veri evi. dev.ts bundled kipte MIMOCODE_HOME'u MiMo-Code-main/.dev-home
 * yapar; PATH'teki `mimo` XDG kullanır. Launcher hangi kipte çözülüyorsa AYNI
 * eve bakarız — yoksa `compose start` bir eve yazıp `runs` başka evi okurdu.
 */
export function mimoDataDir(): string | null {
  if (process.env.MIMOCODE_HOME) return join(process.env.MIMOCODE_HOME, 'data');
  const launcher = resolveMimoLauncher();
  if (!launcher) return null;
  if (launcher.cmd === 'mimo') {
    const xdg = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
    return join(xdg, 'mimocode');
  }
  const dir = findMimoDir();
  return dir ? join(dir, '.dev-home', 'data') : null;
}

export interface WorkflowRunInfo {
  runId: string;
  /** Journal'a işlenmiş (tamamlanmış) agent sonucu sayısı */
  agents: number;
  /** Journal'daki son faz başlığı (crash anında hangi aşamadaydı) */
  lastPhase: string | null;
}

/**
 * `<data>/workflow/<runID>.jsonl` içeriğini ayrıştır (saf — testlenebilir).
 * Satır tipleri (persistence.ts JournalEvent): {t:"agent"}, {t:"log"}, {t:"phase",title}.
 * Crash anında yarım yazılmış son satır olabilir — bozuk satırlar atlanır.
 */
export function parseWorkflowJournal(runId: string, content: string): WorkflowRunInfo {
  let agents = 0;
  let lastPhase: string | null = null;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as { t?: string; title?: string };
      if (ev.t === 'agent') agents++;
      else if (ev.t === 'phase' && typeof ev.title === 'string') lastPhase = ev.title;
    } catch {
      /* yarım satır — atla */
    }
  }
  return { runId, agents, lastPhase };
}

/** workflow_run durumlarını MiMo'nun SQLite'ından oku (sqlite3 CLI varsa; yoksa boş). */
function readRunStatuses(dataDir: string): Map<string, { status: string; session: string; name: string }> {
  const out = new Map<string, { status: string; session: string; name: string }>();
  const db = join(dataDir, 'mimocode.db');
  if (!onPath('sqlite3') || !existsSync(db)) return out;
  const res = spawnSync(
    'sqlite3',
    ['-readonly', db, 'select id||char(9)||status||char(9)||session_id||char(9)||name from workflow_run;'],
    { encoding: 'utf8', timeout: 5000 },
  );
  if (res.status !== 0 || !res.stdout) return out;
  for (const line of res.stdout.split('\n')) {
    const [id, status, session, name] = line.split('\t');
    if (id && status) out.set(id, { status, session: session ?? '', name: name ?? '' });
  }
  return out;
}

function handleComposeRuns(): void {
  const dataDir = mimoDataDir();
  if (!dataDir) {
    notFound('MiMo Code', ['bundled sürüm için: bash scripts/setup-cores.sh']);
    return;
  }
  const wfDir = join(dataDir, 'workflow');
  const journals = existsSync(wfDir)
    ? readdirSync(wfDir).filter((f) => f.endsWith('.jsonl'))
    : [];

  console.log(chalk.bold('\n🗂  Kalıcı workflow koşuları') + chalk.gray(`  (${wfDir})\n`));
  if (journals.length === 0) {
    console.log('  Kayıtlı koşu yok.');
    console.log(chalk.gray('  Not: compose ajanı bir skill orkestratörüdür — her koşu workflow'));
    console.log(chalk.gray('  motorunu kullanmaz. Kalıcı journal yalnız workflow-tool koşularında'));
    console.log(chalk.gray('  oluşur; diğer koşuların kalıcılığı oturum geçmişi + docs/compose'));
    console.log(chalk.gray('  artefaktlarıdır (spec/plan/report).\n'));
    return;
  }

  const statuses = readRunStatuses(dataDir);
  const rows = journals
    .map((f) => {
      const runId = f.replace(/\.jsonl$/, '');
      const info = parseWorkflowJournal(runId, readFileSync(join(wfDir, f), 'utf8'));
      const mtime = statSync(join(wfDir, f)).mtime;
      return { ...info, mtime, db: statuses.get(runId) };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  for (const r of rows) {
    // DB'de "running" görünen ölü süreç koşusu da RESUME EDİLEBİLİR (motor davranışı).
    const status = r.db?.status ?? chalk.gray('bilinmiyor (sqlite3 yok)');
    console.log(`  ${chalk.cyan(r.runId)}  ${status}`);
    console.log(
      `     faz: ${r.lastPhase ?? '—'} · işlenen agent: ${r.agents} · son etkinlik: ${r.mtime.toISOString()}` +
        (r.db?.session ? `\n     oturum: ${r.db.session}` : ''),
    );
  }
  console.log(chalk.gray('\n  Devam etmek için: caphlon compose resume [oturum-id]'));
  console.log(chalk.gray('  → TUI içinde /workflows → Resume (tamamlanan agent sonuçları'));
  console.log(chalk.gray("  journal cache'inden anında döner, yalnız eksikler yeniden koşar).\n"));
}

async function handleComposeStart(args: string[]): Promise<void> {
  const description = args.join(' ').trim();
  if (!description) {
    console.log('❌ Ne inşa etmek istediğini yaz.  Kullanım: caphlon compose start <açıklama>\n');
    return;
  }

  console.log(chalk.bold('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.bold('║     Caphlon Compose — MiMo Code akışı     ║'));
  console.log(chalk.bold('╚══════════════════════════════════════════╝\n'));
  console.log(`📋 Görev: ${chalk.cyan(description)}\n`);
  for (let i = 0; i < COMPOSE_STAGES.length; i++) {
    const s = COMPOSE_STAGES[i];
    console.log(`  ${s.emoji} ${i + 1}. ${s.name} — ${chalk.gray(s.desc)}`);
  }
  console.log('');

  // AKTİF skill enjeksiyonu: ayrıştırma yolu da göreve uygun tam SKILL.md'leri alsın.
  const { prompt, used } = buildSkillPreamble(description);
  if (used.length) {
    console.log(chalk.green(`🧩 ${used.length} skill aktif enjekte edildi: ${used.join(', ')}\n`));
  }

  await launchMimo(['--prompt', prompt], 'compose');
}

/** Gerçek MiMo'yu compose ajanıyla, bağlı modelle başlat. */
async function launchMimo(extraArgs: string[], agent: string): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }

  const launcher = resolveMimoLauncher();
  if (!launcher) {
    notFound('MiMo Code', [
      'npm install -g @mimo-ai/cli',
      'veya bundled sürüm için Bun kur (https://bun.sh) + MiMo-Code-main bağımlılıklarını yükle',
    ]);
    return;
  }

  // MiMo bir OpenCode fork'u: modeli hem --model bayrağıyla (provider/model) hem
  // de ortam değişkenleriyle (ANTHROPIC_API_KEY vb.) geçir → manuel onboarding yok.
  // --trust workspace güven sorusunu atlar (akışı kesmesin).
  const modelStr = opencodeModelString(active);
  const args = [...launcher.baseArgs, '--model', modelStr, '--agent', agent, '--trust', ...extraArgs];
  console.log(chalk.bold(`🐙 MiMo Compose — ${chalk.cyan(modelStr)}`));

  // Kör doğrulama: judge modeli bağlıysa MiMo'nun goal stop-condition gate'i
  // (erken durma yargıcı) bu BAĞIMSIZ modelle karar verir — çalışan model
  // kendi "bitti" beyanını onaylayamaz. Bağlı değilse eski davranış.
  const judge = getJudgeModel();
  const env: Record<string, string> = { ...activeModelEnv(), ...judgeModelEnv() };
  if (judge) {
    env.MIMOCODE_CONFIG_CONTENT = JSON.stringify({
      experimental: { judgeModel: opencodeModelString(judge) },
    });
    console.log(chalk.green(`   ⚖️  Kör doğrulama: judge = ${chalk.bold(opencodeModelString(judge))} (bağımsız)`));
  }
  console.log(chalk.gray('   caphlon connect ile bağlı model kullanılıyor\n'));

  spawnInherit(launcher.cmd, args, env, launcher.cwd);
}

function handleComposeList(): void {
  console.log('\n📋 Caphlon Compose — Aşamalar (MiMo Code):\n');
  for (let i = 0; i < COMPOSE_STAGES.length; i++) {
    const s = COMPOSE_STAGES[i];
    console.log(`  ${i + 1}. ${s.emoji} ${s.name} — ${chalk.gray(s.desc)}`);
  }
  console.log('\nKullanım:');
  console.log('  caphlon compose start <açıklama>   Yeni compose akışı başlat');
  console.log('  caphlon compose resume [session]    Son oturuma (ya da verilen oturuma) devam et');
  console.log('  caphlon compose runs                Kalıcı workflow koşularını listele\n');
}

function showComposeHelp(): void {
  console.log('\n📋 Caphlon Compose (MiMo Code) komutları:');
  console.log('  caphlon compose start <açıklama>   Compose ajanını bu görevle başlat');
  console.log('  caphlon compose list                Aşamaları göster');
  console.log('  caphlon compose resume [session]    Son oturuma (--continue) ya da verilen oturuma (--session) devam et');
  console.log('  caphlon compose runs                Kalıcı workflow koşularını listele (journal + durum)\n');
}

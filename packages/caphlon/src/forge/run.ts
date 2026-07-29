/**
 * Caphlon Forge — aday üretimi ve kanıt toplama (süreç katmanı).
 *
 * No-rewrite: kodu Caphlon yazmaz — gerçek Aider yazar. Caphlon'un işi
 * izolasyon (git worktree), kanıt (projenin kendi doğrulama komutları) ve
 * karar (select.ts). Bir adayın diğerini bozması imkânsızdır: her aday kendi
 * worktree'sinde, kendi geçici dalında çalışır.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAiderLauncher } from '../commands/code.js';
import { aiderModelString, type ActiveModel } from '../config/active.js';
import type { CandidateEvidence, CheckResult } from './select.js';
import type { VerifyCommand } from './verify.js';

const AIDER_TIMEOUT_MS = 15 * 60 * 1000;
const CHECK_TIMEOUT_MS = 10 * 60 * 1000;

function git(args: string[], cwd: string) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

export interface Worktree {
  id: string;
  path: string;
  branch: string;
}

/** Depo git deposu mu ve commit'i var mı? (worktree bunları ister) */
export function repoReady(repo: string): { ok: boolean; detail: string } {
  if (git(['rev-parse', '--git-dir'], repo).status !== 0) {
    return { ok: false, detail: 'burası bir git deposu değil (forge izolasyon için git worktree kullanır)' };
  }
  if (git(['rev-parse', 'HEAD'], repo).status !== 0) {
    return { ok: false, detail: 'depoda henüz commit yok (en az bir commit gerekir)' };
  }
  return { ok: true, detail: 'ok' };
}

/**
 * N izole worktree kur. node_modules git'te olmadığından, varsa ana depodan
 * sembolik bağ kurulur — aksi halde `npm test` her adayda kurulum ister
 * (dakikalar + ağ). Bu bilinçli bir hız/izolasyon dengesidir: bağımlılıklar
 * paylaşılır, KAYNAK KOD tamamen izoledir.
 */
export function createWorktrees(repo: string, n: number, stamp: string): Worktree[] {
  const base = mkdtempSync(join(tmpdir(), 'caphlon-forge-'));
  const out: Worktree[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `c${i}`;
    const path = join(base, id);
    const branch = `caphlon-forge/${stamp}-${id}`;
    const r = git(['worktree', 'add', '-b', branch, path, 'HEAD'], repo);
    if (r.status !== 0) continue;
    for (const dep of ['node_modules']) {
      const src = join(repo, dep);
      if (existsSync(src) && !existsSync(join(path, dep))) {
        try {
          symlinkSync(src, join(path, dep));
        } catch {
          /* bağ kurulamazsa aday yine çalışır, sadece yavaşlar */
        }
      }
    }
    out.push({ id, path, branch });
  }
  return out;
}

export function removeWorktrees(repo: string, wts: Worktree[]): void {
  for (const w of wts) {
    git(['worktree', 'remove', '--force', w.path], repo);
    git(['branch', '-D', w.branch], repo);
  }
}

/** Gerçek Aider'ı headless çalıştır (aday üretimi). */
export function runAider(
  wt: Worktree,
  task: string,
  active: ActiveModel,
  skillPaths: string[],
): { ok: boolean; detail: string } {
  const launcher = resolveAiderLauncher();
  if (!launcher) return { ok: false, detail: 'aider bulunamadı (bash scripts/setup-cores.sh)' };

  const env: NodeJS.ProcessEnv = { ...process.env, ...launcher.env };
  if (active.apiKey) env[active.provider.envVar] = active.apiKey;
  if (active.provider.id === 'ollama') env.OLLAMA_API_BASE = active.baseUrl;

  const res = spawnSync(
    launcher.cmd,
    [
      ...launcher.baseArgs,
      '--model', aiderModelString(active),
      '--message', task,
      '--yes-always',
      '--no-stream',
      '--no-auto-commit', // commit'i biz kontrol ederiz (diff'i temiz okumak için)
      ...skillPaths.flatMap((p) => ['--read', p]),
    ],
    { cwd: wt.path, encoding: 'utf8', env, timeout: AIDER_TIMEOUT_MS },
  );
  if (res.error) return { ok: false, detail: `aider başlatılamadı: ${res.error.message}` };
  if (res.status !== 0) {
    return { ok: false, detail: `aider hata (exit ${res.status}): ${(res.stderr ?? '').slice(-400)}` };
  }
  return { ok: true, detail: 'ok' };
}

/** Adayın ürettiği değişiklik (diff) ve büyüklüğü. */
export function candidateDiff(wt: Worktree): { diff: string; size: number; changed: boolean } {
  git(['add', '-A'], wt.path);
  const diff = git(['diff', '--cached'], wt.path).stdout ?? '';
  const stat = git(['diff', '--cached', '--numstat'], wt.path).stdout ?? '';
  const size = stat
    .split('\n')
    .filter(Boolean)
    .reduce((acc, line) => {
      const [add, del] = line.split('\t');
      return acc + (parseInt(add ?? '0', 10) || 0) + (parseInt(del ?? '0', 10) || 0);
    }, 0);
  return { diff, size, changed: diff.trim().length > 0 };
}

/** Projenin KENDİ doğrulama komutlarını adayın worktree'sinde koştur. */
export function runChecks(wt: Worktree, cmds: VerifyCommand[]): CheckResult[] {
  const out: CheckResult[] = [];
  for (const c of cmds) {
    const r = spawnSync(c.argv[0]!, c.argv.slice(1), {
      cwd: wt.path,
      encoding: 'utf8',
      timeout: CHECK_TIMEOUT_MS,
    });
    const passed = !r.error && r.status === 0;
    out.push({
      label: c.label,
      passed,
      essential: c.essential,
      detail: passed ? undefined : `${(r.stderr ?? '').slice(-300)}${(r.stdout ?? '').slice(-300)}`,
    });
    // Zorunlu bir kontrol düştüyse gerisini koşturmak boşa zaman (ucuz eleme).
    if (!passed && c.essential) break;
  }
  return out;
}

/** Bir adayı baştan sona koştur: üret → diff → kanıt. */
export function evaluateCandidate(
  wt: Worktree,
  task: string,
  active: ActiveModel,
  skillPaths: string[],
  cmds: VerifyCommand[],
): { evidence: CandidateEvidence; diff: string } {
  const gen = runAider(wt, task, active, skillPaths);
  if (!gen.ok) {
    return {
      evidence: { id: wt.id, changed: false, diffSize: 0, checks: [], error: gen.detail },
      diff: '',
    };
  }
  const d = candidateDiff(wt);
  if (!d.changed) {
    return { evidence: { id: wt.id, changed: false, diffSize: 0, checks: [] }, diff: '' };
  }
  const checks = runChecks(wt, cmds);
  return {
    evidence: { id: wt.id, changed: true, diffSize: d.size, checks },
    diff: d.diff,
  };
}

/**
 * Kazananı kullanıcının çalışma ağacına uygula. Commit ATMAYIZ — kullanıcı
 * diff'i görüp kendi commit'ini yapar (kimsenin dalına habersiz yazmayız).
 */
export function landWinner(repo: string, diff: string): { ok: boolean; detail: string } {
  const patch = join(mkdtempSync(join(tmpdir(), 'caphlon-forge-patch-')), 'winner.patch');
  try {
    writeFileSync(patch, diff.endsWith('\n') ? diff : diff + '\n');
    const r = spawnSync('git', ['apply', '--3way', patch], { cwd: repo, encoding: 'utf8' });
    if (r.status !== 0) {
      return { ok: false, detail: `git apply başarısız:\n${(r.stderr ?? '').slice(-500)}` };
    }
    return { ok: true, detail: 'çalışma ağacına uygulandı (commit atılmadı — diff’i gözden geçir)' };
  } finally {
    rmSync(patch, { force: true });
  }
}

/** Doğrulama komutlarını keşfetmek için proje dosyalarını oku. */
export function readProjectFiles(repo: string): {
  packageJson?: string;
  pyprojectToml?: string;
  cargoToml?: string;
  goMod?: string;
  makefile?: string;
} {
  const read = (f: string) => {
    const p = join(repo, f);
    return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
  };
  return {
    packageJson: read('package.json'),
    pyprojectToml: read('pyproject.toml'),
    cargoToml: read('Cargo.toml'),
    goMod: read('go.mod'),
    makefile: read('Makefile'),
  };
}

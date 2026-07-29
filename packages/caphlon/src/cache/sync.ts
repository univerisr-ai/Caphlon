/**
 * Caphlon — Git-Merkez: çözüm havuzunun git senkronu.
 *
 * Paylaşım omurgası bir sunucu değil, bir git reposudur (kullanıcı kararı:
 * kartsız/ücretsiz/kalıcı tek altyapı GitHub). skills.ts sync'inin KANITLANMIŞ
 * mirror-clone deseninin cache uyarlaması:
 *
 *   push: mirror'ı senkronla → uzak pool.jsonl + yerel teknik havuzu BİRLEŞTİR
 *         → pool.jsonl yaz → commit+push → birleşimi yerele de içe aktar
 *         (push aynı zamanda tam iki yönlü senkrondur)
 *   pull: mirror'ı senkronla → pool.jsonl'ü yerel havuza içe aktar
 *
 * Birleşme kuralı: entry_id birleşim anahtarıdır; yüksek version kazanır
 * (düzeltmeler yayılır), eşitse yeni updated_at. KİŞİSEL havuz ASLA senkrona
 * girmez. İçe aktarımda sır taraması ikinci savunma hattı olarak çalışır.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { caphlonHome } from '../config/store.js';
import { DualCache, type PoolEntry } from './dual-cache.js';

const SYNC_BRANCH = 'main';
const POOL_FILE = 'pool.jsonl';

function cacheHomeDir(): string {
  const d = join(caphlonHome(), 'cache');
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

const syncRepoDir = () => join(cacheHomeDir(), '.sync-repo');
const syncStatePath = () => join(cacheHomeDir(), 'sync.json');

interface SyncState {
  remote: string | null;
  lastPushAt: string | null;
  lastPullAt: string | null;
}

export function loadCacheSyncState(): SyncState {
  try {
    return { remote: null, lastPushAt: null, lastPullAt: null, ...JSON.parse(readFileSync(syncStatePath(), 'utf8')) };
  } catch {
    return { remote: null, lastPushAt: null, lastPullAt: null };
  }
}

function saveSyncState(s: SyncState): void {
  writeFileSync(syncStatePath(), JSON.stringify(s, null, 2) + '\n', { mode: 0o600 });
}

/** owner/repo kısaltmasını https URL'ine çevir; tam URL/yerel yol aynen kalır. */
export function normalizeRemote(repo: string): string {
  const r = repo.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(r)) return `https://github.com/${r}.git`;
  return r;
}

function git(args: string[], cwd: string) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' });
}

/** skills.ts ensureSyncMirror'ın birebir uyarlaması (cache dizini için). */
function ensureSyncMirror(remote: string): string {
  const dir = syncRepoDir();
  const haveRepo = existsSync(join(dir, '.git'));
  const sameRemote = haveRepo && git(['remote', 'get-url', 'origin'], dir).stdout.trim() === remote;
  if (!sameRemote) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    if (git(['init'], dir).status !== 0) throw new Error('git init başarısız');
    git(['remote', 'add', 'origin', remote], dir);
  }
  git(['fetch', 'origin'], dir);
  let base: string | null = null;
  for (const ref of [`origin/${SYNC_BRANCH}`, 'origin/master']) {
    if (git(['rev-parse', '--verify', ref], dir).status === 0) {
      base = ref;
      break;
    }
  }
  if (base) git(['checkout', '-B', SYNC_BRANCH, base], dir);
  else git(['symbolic-ref', 'HEAD', `refs/heads/${SYNC_BRANCH}`], dir);
  return dir;
}

/** JSONL ayrıştır — bozuk satırlar atlanır (kısmi push/çakışma artığı olabilir). */
export function parsePool(content: string): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as PoolEntry;
      if (e.entry_id && e.instruction && e.output) out.push(e);
    } catch {
      /* atla */
    }
  }
  return out;
}

/**
 * Havuz birleşimi (saf — testlenebilir): entry_id anahtar; yüksek version
 * kazanır, eşitse yeni updated_at. Deterministik çıktı (entry_id sıralı).
 */
export function mergePools(a: PoolEntry[], b: PoolEntry[]): PoolEntry[] {
  const byId = new Map<string, PoolEntry>();
  for (const e of [...a, ...b]) {
    const cur = byId.get(e.entry_id);
    if (!cur || e.version > cur.version || (e.version === cur.version && e.updated_at > cur.updated_at)) {
      byId.set(e.entry_id, e);
    }
  }
  return [...byId.values()].sort((x, y) => x.entry_id.localeCompare(y.entry_id));
}

function serializePool(entries: PoolEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
}

export interface CacheSyncResult {
  remote: string;
  poolSize: number;
  added: number; // yerel havuza yeni giren
  updated: number; // yereldeki düzeltilen (yüksek versiyon geldi)
  skippedSecret: number;
  changed: boolean; // uzakta commit oluştu mu (push için)
}

export function cacheSyncPush(repoArg: string | undefined, at: string): CacheSyncResult {
  const state = loadCacheSyncState();
  const remote = repoArg ? normalizeRemote(repoArg) : state.remote;
  if (!remote) {
    throw new Error('Uzak depo tanımlı değil. Bir kez verin:  caphlon cache sync push <owner/repo>');
  }
  const dir = ensureSyncMirror(remote);
  const poolPath = join(dir, POOL_FILE);
  const remotePool = existsSync(poolPath) ? parsePool(readFileSync(poolPath, 'utf8')) : [];

  const cache = new DualCache();
  try {
    const merged = mergePools(remotePool, cache.exportTechnical());
    // Birleşimi yerele de işle — push aynı zamanda tam senkrondur.
    const imp = cache.importEntries(merged);

    writeFileSync(poolPath, serializePool(merged));
    git(['add', '-A'], dir);
    const dirty = git(['status', '--porcelain'], dir).stdout.trim() !== '';
    if (dirty) {
      const commit = git(['commit', '-m', `caphlon cache sync: ${merged.length} çözüm @ ${at}`], dir);
      if (commit.status !== 0) {
        throw new Error(`commit başarısız:\n${commit.stderr.trim() || commit.stdout.trim()}`);
      }
      const push = git(['push', '-u', 'origin', SYNC_BRANCH], dir);
      if (push.status !== 0) {
        throw new Error(
          `git push başarısız (kimlik/erişim?):\n${push.stderr.trim()}\n  İpucu: gh auth login`,
        );
      }
    }
    saveSyncState({ ...state, remote, lastPushAt: at });
    return { remote, poolSize: merged.length, ...imp, changed: dirty };
  } finally {
    cache.close();
  }
}

export function cacheSyncPull(repoArg: string | undefined, at: string): CacheSyncResult {
  const state = loadCacheSyncState();
  const remote = repoArg ? normalizeRemote(repoArg) : state.remote;
  if (!remote) {
    throw new Error('Uzak depo tanımlı değil. Bir kez verin:  caphlon cache sync pull <owner/repo>');
  }
  const dir = ensureSyncMirror(remote);
  const poolPath = join(dir, POOL_FILE);
  const remotePool = existsSync(poolPath) ? parsePool(readFileSync(poolPath, 'utf8')) : [];

  const cache = new DualCache();
  try {
    const imp = cache.importEntries(remotePool);
    saveSyncState({ ...state, remote, lastPullAt: at });
    return { remote, poolSize: remotePool.length, ...imp, changed: false };
  } finally {
    cache.close();
  }
}

/**
 * Qualixar OS Bridge — Caphlon'un Qualixar OS ile iletişim katmanı.
 *
 * Qualixar OS'u alt süreç olarak başlatır, durumunu sorgular,
 * task gönderir ve sonuçları toplar.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { activeModelEnv, getActiveModel, type ActiveModel } from './config/active.js';
import { caphlonHome } from './config/store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QosInstance {
  process: ChildProcess;
  port: number;
  dashboardPort: number;
}

export interface QosStatus {
  running: boolean;
  port?: number;
  dashboardPort?: number;
  pid?: number;
}

export interface TaskResult {
  success: boolean;
  output: string;
  error?: string;
}

/** Cross-process record of a running Qualixar OS server. */
interface QosLock {
  port: number;
  dashboardPort: number;
  pid: number;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Lock file — lets a separate process (`caphlon run`/`status`) discover the
// `caphlon dev` server, instead of relying on in-memory state. ~/.caphlon/qos.json
// ---------------------------------------------------------------------------

function lockPath(): string {
  return join(caphlonHome(), 'qos.json');
}

function writeLock(lock: QosLock): void {
  try {
    writeFileSync(lockPath(), JSON.stringify(lock, null, 2), { mode: 0o600 });
  } catch {
    /* best effort — discovery still works for the in-process instance */
  }
}

function readLock(): QosLock | null {
  try {
    const raw = readFileSync(lockPath(), 'utf8');
    const lock = JSON.parse(raw) as QosLock;
    if (typeof lock.port === 'number' && typeof lock.pid === 'number') return lock;
    return null;
  } catch {
    return null;
  }
}

function clearLock(): void {
  try {
    rmSync(lockPath(), { force: true });
  } catch {
    /* best effort */
  }
}

/** Is a PID alive? (signal 0 probes without actually signalling.) */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM = exists but not ours; ESRCH = gone.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Discover a Qualixar OS server reachable from THIS process — the in-memory
 * instance if we started one, otherwise a `caphlon dev` recorded in the lock
 * file whose /api/health actually answers. Returns null if nothing responds.
 */
export async function discoverQos(): Promise<QosStatus | null> {
  if (activeInstance && isQosRunning()) {
    return {
      running: true,
      port: activeInstance.port,
      dashboardPort: activeInstance.dashboardPort,
      pid: activeInstance.process.pid,
    };
  }

  const lock = readLock();
  if (!lock) return null;

  // Stale lock (process gone) → clean it up.
  if (!pidAlive(lock.pid)) {
    clearLock();
    return null;
  }

  if (await healthOk(lock.port)) {
    return {
      running: true,
      port: lock.port,
      dashboardPort: lock.dashboardPort,
      pid: lock.pid,
    };
  }
  return null;
}

async function healthOk(port: number, timeoutMs = 2000): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Root directory of this project (packages/caphlon/../../) */
function findProjectRoot(): string {
  return resolve(import.meta.dirname, '..', '..', '..');
}

/** Qualixar OS dizinini bul */
function findQosDir(): string | null {
  const candidates = [
    join(findProjectRoot(), 'qualixar-os-main'),
    join(findProjectRoot(), 'core', 'qualixar-os-main'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'bin', 'qos.js'))) return dir;
  }
  return null;
}

/** Open Design daemon kontrolü */
function findOpenDesignDir(): string | null {
  const candidates = [
    join(findProjectRoot(), 'open-design-main'),
    join(findProjectRoot(), 'core', 'open-design-main'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'package.json'))) return dir;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Qualixar OS Lifecycle
// ---------------------------------------------------------------------------

let activeInstance: QosInstance | null = null;

/**
 * Qualixar OS, native better-sqlite3'e bağlı. better-sqlite3 prebuild'leri
 * `make setup-cores` ile Node 22 (LTS) altında derlenir; Node 24+ ile ABI
 * uyuşmazlığı (NODE_MODULE_VERSION) olur. Çağıran node çok yeniyse, qos'u
 * çalıştırmak için uyumlu bir Node 22 binary'si bul. Bulunamazsa 'node'a düş.
 */
export function resolveNodeForQos(): string {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) return process.execPath; // mevcut node zaten uygun

  const candidates = [
    '/opt/homebrew/opt/node@22/bin/node',
    '/usr/local/opt/node@22/bin/node',
  ];
  // nvm: ~/.nvm/versions/node/v22.x.y/bin/node
  try {
    const nvmDir = join(homedir(), '.nvm', 'versions', 'node');
    for (const v of readdirSync(nvmDir)) {
      if (v.startsWith('v22.')) candidates.push(join(nvmDir, v, 'bin', 'node'));
    }
  } catch {
    /* nvm yok */
  }
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return 'node';
}

/**
 * Qualixar OS'u başlatır.
 * Eğer qualixar-os-main dizini yoksa, kullanıcıya kurulum talimatı gösterir.
 */
export async function startQos(
  port = 3000,
  dashboardPort = 3001,
  options: { dashboard?: boolean } = {},
): Promise<QosInstance> {
  if (activeInstance) {
    return activeInstance;
  }

  const qosDir = findQosDir();

  if (!qosDir) {
    throw new Error(
      'Qualixar OS bulunamadı. Lütfen qualixar-os-main dizinini proje köküne yerleştirin.\n' +
      '  git clone https://github.com/qualixar/qualixar-os.git qualixar-os-main'
    );
  }

  // qos kendi ~/.qualixar-os/config.yaml'ından model okur; UNDERDOG_LLM_* env'ini
  // OKUMAZ. Bu yüzden `caphlon connect` modelinden geçerli bir qos config üret —
  // yoksa qos'un LLM'i olmaz ve görevler hep pending'de kalır.
  ensureQosConfig();

  // qos serve arayüzü: -p/--port <port> ve boolean --dashboard (port almaz).
  const serveArgs = [join(qosDir, 'bin', 'qos.js'), 'serve', '--port', String(port)];
  if (options.dashboard) serveArgs.push('--dashboard');

  // Qualixar OS CLI'ı alt süreç olarak başlat (ABI-uyumlu Node ile)
  const child = spawn(resolveNodeForQos(), serveArgs, {
    cwd: qosDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CAPHLON_MODE: '1',
      // Inject the active model + API key bound via `caphlon connect`
      ...activeModelEnv(),
    },
  });

  activeInstance = {
    process: child,
    port,
    dashboardPort,
  };

  // Capture a tail of stderr so an early crash produces an actionable error
  // (e.g. "dist eksik") instead of a blank 30s timeout.
  let stderrTail = '';
  child.stderr?.on('data', (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-1200);
  });

  // undefined = hâlâ çalışıyor; number|null = çıkış kodu. (Object yerine skaler →
  // closure mutasyonu TS tarafından 'never'a daralmaz.)
  let exitCode: number | null | undefined;
  // If the child dies on its own, drop the lock so discovery stays honest.
  child.on('exit', (code) => {
    exitCode = code;
    if (activeInstance?.process === child) activeInstance = null;
    const lock = readLock();
    if (lock && lock.pid === child.pid) clearLock();
  });

  // Bekle — server hazır olana kadar (ya da çocuk erken çökene kadar: hızlı başarısız)
  try {
    await waitForServer(port, () => exitCode !== undefined);
  } catch (err) {
    if (exitCode !== undefined) {
      const hint = stderrTail.includes('ERR_MODULE_NOT_FOUND') || stderrTail.includes('Cannot find module')
        ? ' — derlenmemiş görünüyor; `make setup-cores` çalıştırın.'
        : '';
      throw new Error(
        `Qualixar OS başlatılamadı (çıkış kodu ${exitCode})${hint}\n${stderrTail.trim()}`,
      );
    }
    throw err;
  }

  // Record for cross-process discovery (caphlon run/status in another shell).
  if (child.pid) {
    writeLock({ port, dashboardPort, pid: child.pid, startedAt: new Date().toISOString() });
  }

  return activeInstance;
}

/**
 * Qualixar OS'u durdurur.
 */
export function stopQos(): void {
  if (activeInstance) {
    const ownPid = activeInstance.process.pid;
    activeInstance.process.kill('SIGTERM');
    activeInstance = null;
    const lock = readLock();
    if (lock && lock.pid === ownPid) clearLock();
  }
}

/**
 * Qualixar OS çalışıyor mu?
 */
export function isQosRunning(): boolean {
  if (!activeInstance) return false;
  try {
    return activeInstance.process.exitCode === null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// API Calls
// ---------------------------------------------------------------------------

export interface RunTaskOptions {
  /** If no server is running, start an ephemeral one for this task, then stop it. */
  autostart?: boolean;
}

/**
 * Qualixar OS'a task gönderir.
 *
 * Sıra: (1) bu process'in başlattığı instance, (2) `caphlon dev` ile başlatılmış
 * ve lock dosyasından keşfedilen çalışan sunucu, (3) autostart ise geçici bir
 * sunucu başlat → görevi çalıştır → kapat. Hiçbiri yoksa anlaşılır bir hata döner.
 */
export async function runTask(prompt: string, options: RunTaskOptions = {}): Promise<TaskResult> {
  let target = await discoverQos();
  let startedEphemeral = false;

  if (!target) {
    if (!options.autostart) {
      return {
        success: false,
        output: '',
        error: 'Qualixar OS çalışmıyor. Önce `caphlon dev` ile başlatın (veya bu komut otomatik başlatır).',
      };
    }
    try {
      const inst = await startQos();
      startedEphemeral = true;
      target = { running: true, port: inst.port, dashboardPort: inst.dashboardPort, pid: inst.process.pid };
    } catch (err) {
      return {
        success: false,
        output: '',
        error: `Qualixar OS başlatılamadı: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  try {
    const response = await fetch(`http://localhost:${target.port}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      return { success: false, output: '', error: `API hatası: ${response.status}` };
    }

    const created = (await response.json()) as Record<string, unknown>;
    const taskId = typeof created.taskId === 'string' ? created.taskId : undefined;

    // qos görevi ASYNC çalıştırır ve hemen {status:'pending'} döner. Gerçek cevabı
    // almak için görev bitene kadar GET /api/tasks/:id ile poll etmeliyiz — aksi
    // halde "pending" yanıtı kullanıcıya gerçek sonuç gibi gösterilirdi (eski bug).
    if (taskId && typeof target.port === 'number') {
      const final = await pollTask(target.port, taskId, 120_000);
      if (final) return final;
      return { success: false, output: '', error: 'Görev zaman aşımına uğradı (sonuç gelmedi).' };
    }
    return { success: true, output: extractOutput(created) };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Only tear down a server WE started for this one task; never kill a user's `caphlon dev`.
    if (startedEphemeral) stopQos();
  }
}

/** Pull a human-readable result out of the task response, falling back to JSON. */
function extractOutput(data: Record<string, unknown>): string {
  for (const key of ['output', 'result', 'message', 'text', 'response']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return JSON.stringify(data, null, 2);
}

/** Caphlon sağlayıcı id'sini qos provider tipine eşle (bilinmeyen = OpenAI-uyumlu). */
function qosProviderType(id: string): string {
  const known = new Set(['openai', 'anthropic', 'openrouter', 'google', 'groq', 'ollama', 'bedrock', 'azure-openai']);
  return known.has(id) ? id : 'openai';
}

/** Aktif modelden geçerli bir qos config.yaml metni üret. */
function renderQosConfig(active: ActiveModel): string {
  const providerId = active.provider.id;
  const type = qosProviderType(providerId);
  const model = JSON.stringify(active.model); // çift tırnak → ":free" gibi içerikler güvenli
  const endpoint = JSON.stringify(active.baseUrl);
  const keyEnv = active.provider.envVar;
  return [
    '# caphlon-generated — `caphlon connect` modelinden üretildi. qos bunu yeniden',
    '# üretebilir. Kendi config\'inizi korumak için bu başlık satırını silin.',
    'mode: companion',
    'models:',
    `  primary: ${model}`,
    `  fallback: ${model}`,
    '  catalog:',
    `    - name: ${model}`,
    `      provider: ${providerId}`,
    `      deployment: ${model}`,
    '      quality_score: 0.7',
    'providers:',
    `  ${providerId}:`,
    `    type: ${type}`,
    `    endpoint: ${endpoint}`,
    `    api_key_env: ${keyEnv}`,
    'budget:',
    '  max_usd: 5',
    '  warn_pct: 0.8',
    'security:',
    '  container_isolation: false',
    '  allowed_paths: []',
    '  denied_commands: []',
    'memory:',
    '  enabled: true',
    '  auto_invoke: true',
    '  max_ram_mb: 50',
    'dashboard:',
    '  enabled: false',
    '  port: 3001',
    'channels:',
    '  mcp: true',
    '  http:',
    '    enabled: true',
    '    port: 3000',
    'observability:',
    '  log_level: info',
    '',
  ].join('\n');
}

/**
 * qos ~/.qualixar-os/config.yaml'ından model okur (UNDERDOG_LLM_* okumaz). Bağlı
 * modelden geçerli bir config üret — ama kullanıcının kendi config'ini EZME
 * (yalnızca yoksa veya caphlon-generated ise yaz).
 */
function ensureQosConfig(): void {
  const active = getActiveModel();
  if (!active) return;
  const dir = join(homedir(), '.qualixar-os');
  const cfgPath = join(dir, 'config.yaml');
  if (existsSync(cfgPath)) {
    try {
      if (!readFileSync(cfgPath, 'utf8').slice(0, 120).includes('caphlon-generated')) return;
    } catch {
      return; // okunamıyorsa dokunma
    }
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(cfgPath, renderQosConfig(active), { mode: 0o600 });
  } catch {
    /* best-effort — yazılamazsa qos kendi default davranışına düşer */
  }
}

const TERMINAL_STATUS = new Set(['completed', 'failed', 'cancelled', 'pending_human_review']);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Görev bitene kadar GET /api/tasks/:id ile poll et; gerçek çıktıyı döndür.
 * Zaman aşımında null döner. Geçici ağ hataları yutulur (tekrar denenir).
 */
async function pollTask(port: number, taskId: string, timeoutMs: number): Promise<TaskResult | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(1200);
    let task: Record<string, unknown> | undefined;
    try {
      const res = await fetch(`http://localhost:${port}/api/tasks/${taskId}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { task?: Record<string, unknown> };
      task = body.task;
    } catch {
      continue; // geçici ağ/sunucu hatası — tekrar dene
    }
    if (!task) continue;
    const status = String(task.status ?? '');
    if (!TERMINAL_STATUS.has(status)) continue; // pending/running → beklemeye devam

    const answer = extractTaskOutput(task);
    if (status === 'failed' || status === 'cancelled') {
      return { success: false, output: '', error: answer || `görev ${status}` };
    }
    return { success: true, output: answer || `(görev durumu: ${status})` }; // completed | pending_human_review
  }
  return null; // zaman aşımı
}

/** task.result (qos TaskResult JSON) veya task alanlarından okunur cevabı çıkar. */
function extractTaskOutput(task: Record<string, unknown>): string {
  const raw = task.result;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.output === 'string' && parsed.output.trim()) return parsed.output;
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
      return extractOutput(parsed);
    } catch {
      return raw; // JSON değil, düz metin
    }
  }
  return extractOutput(task);
}

/**
 * Qualixar OS durumunu sorgula.
 */
export async function getStatus(): Promise<QosStatus> {
  // Works across processes: discovers our own instance OR a running `caphlon dev`.
  const discovered = await discoverQos();
  return discovered ?? { running: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForServer(
  port: number,
  hasExited: () => boolean = () => false,
  timeoutMs = 30_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Çocuk process çöktüyse beklemeyi bırak — çağıran nedeni raporlar.
    if (hasExited()) throw new Error('Qualixar OS süreci hazır olmadan sonlandı.');
    try {
      const response = await fetch(`http://localhost:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // Henüz hazır değil, bekle
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Qualixar OS ${timeoutMs / 1000}s içinde başlamadı.`);
}

// ---------------------------------------------------------------------------
// Open Design Bridge
// ---------------------------------------------------------------------------

/**
 * Open Design daemon'ının çalışıp çalışmadığını kontrol eder.
 */
export async function checkOpenDesign(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:7456/api/health', {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Open Design sistemlerini listeler (design_system_list tool wrapper).
 */
export async function listDesignSystems(filter?: string): Promise<string[]> {
  // Bu, Qualixar OS üzerinden Open Design MCP tool'larını çağırır
  // Şimdilik Open Design API'den direkt sorgula
  try {
    const url = filter
      ? `http://localhost:7456/api/design-systems?filter=${encodeURIComponent(filter)}`
      : 'http://localhost:7456/api/design-systems';
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const data = await response.json() as Record<string, unknown>;
    return Array.isArray(data.systems) ? data.systems as string[] : [];
  } catch {
    return [];
  }
}

export {
  findProjectRoot,
  findQosDir,
  findOpenDesignDir,
};

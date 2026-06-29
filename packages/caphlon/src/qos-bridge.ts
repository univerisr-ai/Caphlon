/**
 * Qualixar OS Bridge — Caphlon'un Qualixar OS ile iletişim katmanı.
 *
 * Qualixar OS'u alt süreç olarak başlatır, durumunu sorgular,
 * task gönderir ve sonuçları toplar.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { activeModelEnv } from './config/active.js';

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
 * Qualixar OS'u başlatır.
 * Eğer qualixar-os-main dizini yoksa, kullanıcıya kurulum talimatı gösterir.
 */
export async function startQos(port = 3000, dashboardPort = 3001): Promise<QosInstance> {
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

  // Qualixar OS CLI'ı alt süreç olarak başlat
  const child = spawn('node', [
    join(qosDir, 'bin', 'qos.js'),
    'serve',
    '--port', String(port),
    '--dashboard-port', String(dashboardPort),
  ], {
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

  // Bekle — server hazır olana kadar
  await waitForServer(port);

  return activeInstance;
}

/**
 * Qualixar OS'u durdurur.
 */
export function stopQos(): void {
  if (activeInstance) {
    activeInstance.process.kill('SIGTERM');
    activeInstance = null;
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

/**
 * Qualixar OS'a task gönderir.
 */
export async function runTask(prompt: string): Promise<TaskResult> {
  if (!activeInstance) {
    return { success: false, output: '', error: 'Qualixar OS çalışmıyor. Önce caphlon dev ile başlatın.' };
  }

  try {
    const response = await fetch(`http://localhost:${activeInstance.port}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      return { success: false, output: '', error: `API hatası: ${response.status}` };
    }

    const data = await response.json() as Record<string, unknown>;
    return {
      success: true,
      output: JSON.stringify(data, null, 2),
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Qualixar OS durumunu sorgula.
 */
export async function getStatus(): Promise<QosStatus> {
  if (!activeInstance) {
    return { running: false };
  }

  try {
    const response = await fetch(`http://localhost:${activeInstance.port}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    return {
      running: response.ok,
      port: activeInstance.port,
      dashboardPort: activeInstance.dashboardPort,
      pid: activeInstance.process.pid,
    };
  } catch {
    return { running: false };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForServer(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
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

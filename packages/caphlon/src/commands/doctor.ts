/**
 * caphlon doctor — Diagnostics and troubleshooting
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findQosDir, findOpenDesignDir, findProjectRoot, checkOpenDesign, resolveNodeForQos } from '../qos-bridge.js';
import { onPath, findPython, projectRoot as root } from '../external.js';
import { tokenlessAvailable } from './tokenless.js';
import { resolveMimoLauncher } from './compose.js';
import { resolveHermesLauncher } from './hermes.js';
import { resolveLauncher as resolveOpencodeLauncher } from './ui.js';
import { resolveFlowerLauncher } from './flower.js';
import { listSkills } from '../config/skills.js';
import { heading, paint } from '../ui/theme.js';

/**
 * Aider GERÇEKTEN çalışır mı? Dosya varlığı yetmez — bağlı bir Python ile
 * `import aider.main` başarılı olmalı (deps + sürüm ≥3.10). Wire'lı entegrasyonun
 * "tam" olduğunu doğrulayan tek güvenilir test budur.
 */
function aiderProbe(repoDir: string): { ready: boolean; detail: string } {
  // 0. Caphlon'un kendi venv'i (caphlon code'un kurduğu izole Python ≥3.10).
  const venvPy = join(repoDir, '..', 'aider-venv', 'bin', 'python');
  if (existsSync(venvPy)) {
    const r = spawnSync(venvPy, ['-c', 'import aider.main'], { stdio: 'ignore' });
    if (r.status === 0) return { ready: true, detail: 'venv (core/aider-venv)' };
  }
  if (onPath('aider')) return { ready: true, detail: 'PATH (aider)' };
  if (!existsSync(join(repoDir, 'aider', '__init__.py'))) {
    return { ready: false, detail: 'bundled kaynak yok' };
  }
  for (const py of ['python3', 'python']) {
    if (!onPath(py)) continue;
    const r = spawnSync(py, ['-c', 'import aider.main'], {
      stdio: 'ignore',
      env: { ...process.env, PYTHONPATH: repoDir },
    });
    if (r.status === 0) return { ready: true, detail: `bundled (${py} -m aider)` };
  }
  return { ready: false, detail: 'import edilemiyor → pip install -e core/aider-main (Python ≥3.10)' };
}

/**
 * Qualixar OS GERÇEKTEN çalışır mı? Dizin varlığı yetmez — `bin/qos.js`,
 * derlenmiş `dist/channels/cli.js`'i import eder ve `node_modules` ister.
 * `caphlon run` oto-başlatması bu üçü olmadan patlar; doctor'ın bunu yakalaması gerekir.
 */
function qosRunnable(qosDir: string | null): { ready: boolean; detail: string } {
  if (!qosDir) return { ready: false, detail: 'Not found' };
  const built = existsSync(join(qosDir, 'dist', 'channels', 'cli.js'));
  const installed = existsSync(join(qosDir, 'node_modules'));
  if (built && installed) return { ready: true, detail: qosDir };
  const missing = [!installed && 'node_modules', !built && 'dist'].filter(Boolean).join(' + ');
  return { ready: false, detail: `${missing} eksik → make setup-cores (veya cd ${qosDir} && npm install && npm run build)` };
}

/**
 * Qualixar OS'un native better-sqlite3'ü GERÇEKTEN import edilebiliyor mu?
 * `dist/` + `node_modules` varlığı yetmez — Node major sürümü değişince
 * (örn. brew node güncellemesi) prebuild ABI'si (NODE_MODULE_VERSION) eskiyle
 * uyuşmaz ve qos'un TÜM test suite'i (ve `run`) sessizce patlar. `caphlon run`
 * ile AYNI Node'u (`resolveNodeForQos`) kullanarak gerçek bir require dener.
 */
function qosNativeDepsOk(qosDir: string): { ok: boolean; detail: string } {
  const r = spawnSync(resolveNodeForQos(), ['-e', "require('better-sqlite3')"], {
    cwd: qosDir,
    stdio: 'ignore',
  });
  if (r.status === 0) return { ok: true, detail: 'better-sqlite3 ABI uyumlu' };
  return {
    ok: false,
    detail: `better-sqlite3 ABI uyumsuz → cd ${qosDir} && npm rebuild better-sqlite3 (veya make setup-cores)`,
  };
}

/** Open Design daemon derlenmiş mi? `od` bundled yolu dist/cli.js ister. */
function odBuilt(odDir: string | null): boolean {
  if (!odDir) return false;
  return existsSync(join(odDir, 'apps', 'daemon', 'dist', 'cli.js'));
}

/**
 * `caphlon ui` içindeki /voice özelliği (MiMo Code'un kendi ASR pipeline'ı)
 * platforma göre bir mikrofon kaydedici bekler. Wire etmemiz gereken tek şey
 * bu — ASR'ın kendisi zaten MiMo'da gerçek ve çalışır durumda.
 */
function voiceRecorderStatus(): { ok: boolean; detail: string } {
  const byPlatform: Record<string, { bins: string[]; install: string }> = {
    darwin: { bins: ['sox', 'rec'], install: 'brew install sox' },
    linux: { bins: ['arecord', 'sox'], install: 'apt install alsa-utils (veya: apt install sox)' },
    win32: { bins: ['sox'], install: 'choco install sox.portable' },
  };
  const plat = byPlatform[process.platform];
  if (!plat) return { ok: false, detail: `${process.platform} için desteklenmiyor` };
  const found = plat.bins.find((b) => onPath(b));
  if (found) return { ok: true, detail: `${found} bulundu` };
  return { ok: false, detail: `kayıt aracı yok → ${plat.install}` };
}

/** Bir python yorumlayıcısının sürümü ≥3.10 mu? (aider ön koşulu) */
function pythonOk(): { ok: boolean; detail: string } {
  // Aider kendi venv'inde çalışıyorsa sistem Python'unun sürümü önemsizdir.
  const venvPy = join(root(), 'core', 'aider-venv', 'bin', 'python');
  if (existsSync(venvPy)) {
    const r = spawnSync(venvPy, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], {
      encoding: 'utf8',
    });
    const v = (r.stdout ?? '').trim();
    if (v) return { ok: true, detail: `aider-venv ${v}` };
  }
  for (const py of ['python3', 'python']) {
    if (!onPath(py)) continue;
    const r = spawnSync(py, ['-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], {
      encoding: 'utf8',
    });
    const v = (r.stdout ?? '').trim();
    const [maj, min] = v.split('.').map((n) => parseInt(n, 10));
    if (maj > 3 || (maj === 3 && min >= 10)) return { ok: true, detail: `${py} ${v}` };
    return { ok: false, detail: `${py} ${v} (aider ≥3.10 ister)` };
  }
  return { ok: false, detail: 'Python yok' };
}

/** llm.ts + serve.ts'in beklediği litellm gerçekten çalışır mı (import + proxy bin). */
function litellmProbe(): boolean {
  const venv = join(root(), 'core', 'aider-venv');
  const py = join(venv, 'bin', 'python');
  if (!existsSync(py) || !existsSync(join(venv, 'bin', 'litellm'))) return false;
  return spawnSync(py, ['-c', 'import litellm'], { stdio: 'ignore' }).status === 0;
}

export async function doctorCommand(options: { fix?: boolean } = {}): Promise<void> {
  console.log('\n' + heading('Caphlon — Diagnostics') + '\n');

  const results: { check: string; status: string; detail: string }[] = [];

  // Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  results.push({
    check: 'Node.js version',
    status: nodeMajor >= 22 ? '✅' : '❌',
    detail: `${nodeVersion} (need 22+)`,
  });

  // Platform
  results.push({
    check: 'Platform',
    status: '✅',
    detail: `${process.platform} ${process.arch}`,
  });

  // Project root
  const projectRoot = findProjectRoot();
  results.push({
    check: 'Project root',
    status: '✅',
    detail: projectRoot,
  });

  // Qualixar OS — built + installed (caphlon run/dev oto-başlatması için şart)
  const qosDir = findQosDir();
  const qos = qosRunnable(qosDir);
  results.push({
    check: 'Qualixar OS (çalışır)',
    status: qos.ready ? '✅' : '❌',
    detail: qos.detail,
  });

  // Sadece kurulu/derlenmişse anlamlı — inşa edilmemiş bir qos'ta native
  // deps kontrolü zaten üstteki kontrolde yakalanır.
  if (qos.ready && qosDir) {
    const native = qosNativeDepsOk(qosDir);
    results.push({
      check: 'Qualixar OS (native deps)',
      status: native.ok ? '✅' : '❌',
      detail: native.detail,
    });
  }

  // Open Design
  const odDir = findOpenDesignDir();
  results.push({
    check: 'Open Design (dir)',
    status: odDir ? '✅' : '⚠️',
    detail: odDir ? odDir : 'Not found',
  });

  // Open Design daemon
  const odRunning = await checkOpenDesign();
  results.push({
    check: 'Open Design (daemon)',
    status: odRunning ? '✅' : 'ℹ️',
    detail: odRunning ? 'Running on :7456' : 'Not running (optional)',
  });

  // Git
  const hasGit = existsSync(join(projectRoot, '.git'));
  results.push({
    check: 'Git repository',
    status: hasGit ? '✅' : '⚠️',
    detail: hasGit ? 'Found' : 'Not found',
  });

  // MEMORY.md
  const hasMemory = existsSync(join(process.cwd(), 'MEMORY.md'));
  results.push({
    check: 'Project memory',
    status: hasMemory ? '✅' : 'ℹ️',
    detail: hasMemory ? 'MEMORY.md found' : 'No MEMORY.md',
  });

  // -- Ön koşullar (aider/open-design'ın TAM entegrasyonu için) -------------
  const py = pythonOk();
  results.push({
    check: 'Python ≥3.10 (aider)',
    status: py.ok ? '✅' : '❌',
    detail: py.detail,
  });
  results.push({
    check: 'pnpm (open-design build)',
    status: onPath('pnpm') ? '✅' : '❌',
    detail: onPath('pnpm') ? 'kurulu' : 'yok → npm i -g pnpm (veya corepack enable)',
  });

  // Open Design DERLENMİŞ mi? (sadece dizin değil)
  results.push({
    check: 'Open Design (built)',
    status: odBuilt(odDir) ? '✅' : '⚠️',
    detail: odBuilt(odDir)
      ? 'dist/cli.js hazır'
      : 'derlenmemiş → cd open-design-main && pnpm install && pnpm --filter @open-design/daemon build',
  });

  // Skill katmanı
  let skillCount = 0;
  try {
    skillCount = listSkills().length;
  } catch {
    /* skills home yoksa 0 */
  }
  results.push({
    check: 'Skill katmanı (caphlon skill)',
    status: '✅',
    detail: skillCount > 0 ? `${skillCount} skill indekslendi` : 'boş → caphlon skill add <repo>',
  });

  // -- Bileşen araçları (gerçek, wire edilmiş) -----------------------------
  const r = root();
  const aider = aiderProbe(join(r, 'core', 'aider-main'));
  const tools: { name: string; ready: boolean; how: string }[] = [
    {
      name: 'OpenCode TUI (caphlon ui)',
      // Komutla AYNI kontrol (ui.ts resolveLauncher): bun + kaynak + node_modules
      // VEYA PATH'te çalışan opencode — yüzeysel "dosya var" değil.
      ready: resolveOpencodeLauncher() !== null,
      how: 'bundled kopyadan: cd core/opencode-main && bun install  (veya PATH kurulumu: opencode)',
    },
    {
      name: 'Aider (caphlon code)',
      ready: aider.ready,
      how: aider.detail,
    },
    {
      name: 'LiteLLM (caphlon serve, tek-atış LLM)',
      // llm.ts/serve.ts ile AYNI beklenti: aider-venv'de litellm import edilebilir
      // VE proxy binary'si var (serve bin/litellm'i çalıştırır).
      ready: litellmProbe(),
      how: 'bundled kopyadan: bash scripts/setup-cores.sh  (aider-venv + litellm[proxy] kurar)',
    },
    {
      name: 'MiMo Code (caphlon compose)',
      // Komutla AYNI kontrol (dizin değil gerçek launcher): bun + dev.ts çözülebiliyor mu.
      ready: resolveMimoLauncher() !== null,
      how: 'npm i -g @mimo-ai/cli  (veya: Bun + MiMo-Code-main bağımlılıkları)',
    },
    {
      name: 'Hermes (caphlon hermes)',
      // Komutla AYNI kontrol: hermes PATH'te VEYA `import hermes_cli.main` başarılı.
      // Dizin var demek "çalışır" değil — deps yoksa import patlar.
      ready: resolveHermesLauncher() !== null,
      how: 'bundled kopyadan: bash scripts/setup-cores.sh  (hermes-venv kurar)',
    },
    {
      name: 'tokenless (caphlon tokenless)',
      ready: tokenlessAvailable(),
      how: 'bundled kopyadan: cd core/tokenless-main && cargo build --release  (Rust toolchain ister)',
    },
    {
      name: 'Flower (caphlon flower)',
      // Komutla AYNI kontrol (flower-venv / PATH / bundled import) — yalancı yeşil yok.
      ready: resolveFlowerLauncher() !== null,
      how: 'pip install flwr  (veya: cd core/flower-main/framework && pip install -e .)',
    },
  ];
  for (const t of tools) {
    results.push({
      check: t.name,
      status: t.ready ? '✅' : 'ℹ️',
      detail: t.ready ? 'hazır' : `kurulu değil → ${t.how}`,
    });
  }

  // MiMo Voice (/voice, caphlon ui içinde): Caphlon bunu yeniden yazmaz —
  // TUI'nin kendi ASR'ı var, sadece platforma özgü bir mikrofon kaydedici
  // binary ister. Sesi Xiaomi/MiMo'nun kendi ASR servisine gönderir; bunun
  // kimlik doğrulaması TUI içindeki `/login` akışıyla yapılır (caphlon connect
  // ile bağlanan model kimliğinden bağımsız) — bu yüzden salt bilgilendirme.
  const voice = voiceRecorderStatus();
  results.push({
    check: 'MiMo Voice (/voice, caphlon ui)',
    status: voice.ok ? '✅' : 'ℹ️',
    detail: voice.detail,
  });

  // Print results
  for (const r of results) {
    console.log(`  ${r.status} ${r.check}`);
    console.log(`     ${paint.dim(r.detail)}`);
  }

  // Summary
  const errors = results.filter((r) => r.status === '❌').length;
  const warnings = results.filter((r) => r.status === '⚠️').length;

  const errPart = errors > 0 ? paint.red(`${errors} errors`) : `${errors} errors`;
  const warnPart = warnings > 0 ? paint.yellow(`${warnings} warnings`) : `${warnings} warnings`;
  console.log(`\n📊 Summary: ${results.length} checks, ${errPart}, ${warnPart}`);
  if (errors === 0) {
    console.log(paint.green('✅ System looks good!'));
    console.log('');
    return;
  }

  if (!options.fix) {
    console.log('❌ Onarım: caphlon doctor --fix  (CLI/Qualixar/Aider+LiteLLM/Hermes kurulumunu onarır;');
    console.log('   pnpm, Python, Node sürümü gibi sistem araçları elle kurulmalıdır)');
    console.log('');
    process.exitCode = 1;
    return;
  }

  // --fix: idempotent setup-cores'u çalıştır (CLI build + Qualixar OS +
  // Aider/LiteLLM venv + Hermes venv + patch replay), sonra tek seferlik
  // yeniden tanıla. Sistem araçlarını (pnpm/Python/Node) KURMAZ.
  const script = join(findProjectRoot(), 'scripts', 'setup-cores.sh');
  if (!existsSync(script)) {
    console.log(`❌ Onarım scripti bulunamadı: ${script}`);
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log('\n🔧 Onarım çalıştırılıyor: scripts/setup-cores.sh\n');
  const fixRun = spawnSync('bash', [script], { stdio: 'inherit', cwd: findProjectRoot() });
  if (fixRun.status !== 0) {
    console.log('\n❌ Onarım scripti hata verdi — yukarıdaki çıktıya bakın.');
    console.log('');
    process.exitCode = 1;
    return;
  }

  console.log('\n🔁 Onarım sonrası yeniden tanılama:\n');
  await doctorCommand({ fix: false }); // tek seferlik tekrar; fix=false → sonsuz döngü yok
}



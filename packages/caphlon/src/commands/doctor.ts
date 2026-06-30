/**
 * caphlon doctor — Diagnostics and troubleshooting
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { findQosDir, findOpenDesignDir, findProjectRoot, checkOpenDesign } from '../qos-bridge.js';
import { onPath, findBun, findPython, firstExisting, projectRoot as root } from '../external.js';
import { tokenlessAvailable } from './tokenless.js';
import { resolveMimoLauncher } from './compose.js';
import { resolveHermesLauncher } from './hermes.js';
import { listSkills } from '../config/skills.js';

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

/** Open Design daemon derlenmiş mi? `od` bundled yolu dist/cli.js ister. */
function odBuilt(odDir: string | null): boolean {
  if (!odDir) return false;
  return existsSync(join(odDir, 'apps', 'daemon', 'dist', 'cli.js'));
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

export async function doctorCommand(options: { fix?: boolean } = {}): Promise<void> {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║        Caphlon — Diagnostics             ║');
  console.log('╚══════════════════════════════════════════╝\n');

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
  const bundled = (...p: string[]) => firstExisting(...p) !== null;
  const aider = aiderProbe(join(r, 'core', 'aider-main'));
  const tools: { name: string; ready: boolean; how: string }[] = [
    {
      name: 'OpenCode TUI (caphlon ui)',
      ready: onPath('opencode') || (!!findBun() && bundled(join(r, 'core', 'opencode-main', 'packages', 'opencode', 'src', 'index.ts'))),
      how: 'bundled (bun) / opencode',
    },
    {
      name: 'Aider (caphlon code)',
      ready: aider.ready,
      how: aider.detail,
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
      how: 'hermes-agent.nousresearch.com/install.sh  (Python deps gerekir)',
    },
    {
      name: 'tokenless (caphlon tokenless)',
      ready: tokenlessAvailable(),
      how: 'cargo install tokenless',
    },
    {
      name: 'Flower (caphlon flower)',
      // Dizin var demek "çalışır" demek DEĞİL: flwr gerçekten import edilebilmeli
      // (caphlon flower ile aynı kontrol). Aksi halde doctor yeşil ama komut patlar.
      ready: ((): boolean => {
        if (onPath('flwr')) return true;
        const dir = firstExisting(join(r, 'core', 'flower-main', 'framework'), join(r, 'flower-main', 'framework'));
        const py = findPython();
        if (!dir || !py) return false;
        return spawnSync(py, ['-c', 'import flwr.cli.app'], {
          stdio: 'ignore',
          env: { ...process.env, PYTHONPATH: dir },
        }).status === 0;
      })(),
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

  // Print results
  for (const r of results) {
    console.log(`  ${r.status} ${r.check}`);
    console.log(`     ${r.detail}`);
  }

  // Summary
  const errors = results.filter((r) => r.status === '❌').length;
  const warnings = results.filter((r) => r.status === '⚠️').length;

  console.log(`\n📊 Summary: ${results.length} checks, ${errors} errors, ${warnings} warnings`);
  if (errors === 0) {
    console.log('✅ System looks good!');
    console.log('');
    return;
  }

  if (!options.fix) {
    console.log('❌ Hataları düzeltmek için: caphlon doctor --fix');
    console.log('');
    process.exitCode = 1;
    return;
  }

  // --fix: idempotent setup-cores'u çalıştır (CLI + qos kurulum/derleme), sonra
  // tek seferlik yeniden tanıla. Script kendisi Node 22'yi ve eksik core'ları halleder.
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



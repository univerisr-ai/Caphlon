/**
 * caphlon status — Check system status
 */

import { getStatus, checkOpenDesign } from '../qos-bridge.js';
import { getActiveModel, getJudgeModel } from '../config/active.js';
import { syncStatus } from '../config/skills.js';
import { DualCache } from '../cache/dual-cache.js';
import { heading, kv, panel } from '../ui/theme.js';

/**
 * `caphlon connect` bağlantı özeti. Anahtarın kendisi ASLA yazdırılmaz —
 * yalnızca var/yok bilgisi gösterilir.
 */
export function renderConnectionLines(): string[] {
  const active = getActiveModel();
  if (!active) {
    return [kv('Status', '⬜ Not connected'), kv('Connect', 'caphlon connect')];
  }
  const key = active.apiKey
    ? '✅ set'
    : `❌ missing (caphlon connect ${active.provider.id})`;
  const judge = getJudgeModel();
  return [
    kv('Active', `${active.provider.id} / ${active.model}`),
    kv('API key', key),
    kv(
      'Judge',
      judge
        ? `${judge.provider.id} / ${judge.model}`
        : '— active model (separate: caphlon connect --judge)',
    ),
  ];
}

/** Token-tasarruf cache özeti (borrow→report döngüsünün gerçek sayaçları). */
export function renderCacheLines(): string[] {
  if (!DualCache.available()) {
    return [kv('Status', 'ℹ️ kapalı (node:sqlite ister — Node 22.13+/23.4+)')];
  }
  const c = new DualCache();
  try {
    const s = c.stats();
    const rate = s.borrows > 0 ? ` · isabet sonrası başarı ${s.worked}/${s.borrows}` : '';
    return [
      kv('Entries', `${s.technical} teknik + ${s.personal} kişisel`),
      kv('Saved', `~${s.estTokensSaved.toLocaleString('en-US')} token${rate}`),
    ];
  } finally {
    c.close();
  }
}

/** Skill sayımı + Living Marketplace sync durumu. */
export function renderSkillLines(): string[] {
  const s = syncStatus();
  const lines = [kv('Skills', `${s.totalSkills} installed (${s.learnedCount} learned)`)];
  if (s.remote) {
    const last = s.lastPushAt ?? s.lastPullAt;
    lines.push(kv('Sync', `${s.remote}${last ? ` (last: ${last})` : ''}`));
  } else {
    lines.push(kv('Sync', '⬜ no remote (caphlon skill sync push <repo>)'));
  }
  return lines;
}

export async function statusCommand(): Promise<void> {
  // Cross-process: getStatus() discovers a `caphlon dev` running in another shell.
  const status = await getStatus();
  const qosRunning = status.running;
  const odAvailable = await checkOpenDesign();

  console.log('\n' + heading('Caphlon — System Status') + '\n');

  // Qualixar OS
  const qosLines = qosRunning
    ? [
        kv('Status', `✅ Running (PID: ${status.pid})`),
        kv('API', `http://localhost:${status.port}`),
        kv('Dash', `http://localhost:${status.dashboardPort}`),
      ]
    : [kv('Status', '⬜ Not running'), kv('Start', 'caphlon dev')];
  console.log(panel('📡 Qualixar OS', qosLines));

  // LLM connection (caphlon connect)
  console.log(panel('🔌 LLM', renderConnectionLines()));

  // Skills + Living Marketplace sync
  console.log(panel('📚 Skills', renderSkillLines()));

  // Token-tasarruf cache'i (borrow→report)
  console.log(panel('🧠 Cache', renderCacheLines()));

  // Open Design
  const odLines = odAvailable
    ? [kv('Status', '✅ Daemon running (port 7456)'), kv('URL', 'http://localhost:7456')]
    : [
        kv('Status', '⬜ Not detected'),
        kv('Start', 'caphlon design daemon start'),
        kv('Build', 'cd open-design-main && pnpm install && pnpm --filter @open-design/daemon build'),
      ];
  console.log(panel('🎨 Open Design', odLines));

  // Memory
  const memoryPath = process.cwd() + '/MEMORY.md';
  const { existsSync } = await import('node:fs');
  const memLines = existsSync(memoryPath)
    ? [kv('Status', '✅ MEMORY.md found')]
    : [kv('Status', '⬜ No MEMORY.md (run caphlon init)')];
  console.log(panel('🧠 Memory', memLines));

  console.log('');
}

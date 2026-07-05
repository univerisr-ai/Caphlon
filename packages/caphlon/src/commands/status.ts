/**
 * caphlon status — Check system status
 */

import { getStatus, checkOpenDesign } from '../qos-bridge.js';
import { getActiveModel, getJudgeModel } from '../config/active.js';
import { syncStatus } from '../config/skills.js';

/**
 * `caphlon connect` bağlantı özeti. Anahtarın kendisi ASLA yazdırılmaz —
 * yalnızca var/yok bilgisi gösterilir.
 */
export function renderConnectionLines(): string[] {
  const active = getActiveModel();
  if (!active) {
    return ['   Status:   ⬜ Not connected', '   Connect:  caphlon connect'];
  }
  const key = active.apiKey
    ? '✅ set'
    : `❌ missing (caphlon connect ${active.provider.id})`;
  const judge = getJudgeModel();
  return [
    `   Active:   ${active.provider.id} / ${active.model}`,
    `   API key:  ${key}`,
    judge
      ? `   Judge:    ${judge.provider.id} / ${judge.model}`
      : '   Judge:    — active model (separate: caphlon connect --judge)',
  ];
}

/** Skill sayımı + Living Marketplace sync durumu. */
export function renderSkillLines(): string[] {
  const s = syncStatus();
  const lines = [`   Skills:   ${s.totalSkills} installed (${s.learnedCount} learned)`];
  if (s.remote) {
    const last = s.lastPushAt ?? s.lastPullAt;
    lines.push(`   Sync:     ${s.remote}${last ? ` (last: ${last})` : ''}`);
  } else {
    lines.push('   Sync:     ⬜ no remote (caphlon skill sync push <repo>)');
  }
  return lines;
}

export async function statusCommand(): Promise<void> {
  // Cross-process: getStatus() discovers a `caphlon dev` running in another shell.
  const status = await getStatus();
  const qosRunning = status.running;
  const odAvailable = await checkOpenDesign();

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         Caphlon — System Status          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  // Qualixar OS
  console.log('📡 Qualixar OS:');
  if (qosRunning) {
    console.log(`   Status:   ✅ Running (PID: ${status.pid})`);
    console.log(`   API:      http://localhost:${status.port}`);
    console.log(`   Dashboard: http://localhost:${status.dashboardPort}`);
  } else {
    console.log('   Status:   ⬜ Not running');
    console.log('   Start:    caphlon dev');
  }

  // LLM connection (caphlon connect)
  console.log('\n🔌 LLM:');
  for (const line of renderConnectionLines()) console.log(line);

  // Skills + Living Marketplace sync
  console.log('\n📚 Skills:');
  for (const line of renderSkillLines()) console.log(line);

  // Open Design
  console.log('\n🎨 Open Design:');
  if (odAvailable) {
    console.log('   Status:   ✅ Daemon running (port 7456)');
    console.log('   URL:      http://localhost:7456');
  } else {
    console.log('   Status:   ⬜ Not detected');
    console.log('   Install:  curl -fsSL https://open-design.ai/install.sh | sh');
  }

  // Memory
  console.log('\n🧠 Memory:');
  const memoryPath = process.cwd() + '/MEMORY.md';
  const { existsSync } = await import('node:fs');
  if (existsSync(memoryPath)) {
    console.log('   Status:   ✅ MEMORY.md found');
  } else {
    console.log('   Status:   ⬜ No MEMORY.md (run caphlon init)');
  }

  console.log('');
}

/**
 * caphlon status — Check system status
 */

import { getStatus, checkOpenDesign } from '../qos-bridge.js';

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

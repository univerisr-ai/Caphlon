/**
 * caphlon dev — Start the Caphlon agent system
 *
 * Starts Qualixar OS server + dashboard,
 * optionally checks for Open Design daemon.
 */

import { startQos, stopQos, getStatus, isQosRunning, checkOpenDesign } from '../qos-bridge.js';

const BANNER = `
╔══════════════════════════════════════════╗
║           Caphlon — Starting             ║
║  Unified AI Agent Platform               ║
╚══════════════════════════════════════════╝
`;

export async function devCommand(options: { port?: string; dashboardPort?: string; noDashboard?: boolean }): Promise<void> {
  const port = parseInt(options.port || '3000', 10);
  const dashboardPort = parseInt(options.dashboardPort || '3001', 10);

  console.log(BANNER);

  // Check if already running
  if (isQosRunning()) {
    console.log('⚠️  Caphlon is already running.');
    const status = await getStatus();
    if (status.running) {
      console.log(`   Dashboard: http://localhost:${status.dashboardPort}`);
    }
    return;
  }

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n⏹️  Stopping Caphlon...');
    stopQos();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopQos();
    process.exit(0);
  });

  try {
    console.log('🚀 Starting Qualixar OS...');
    const qos = await startQos(port, dashboardPort);

    console.log(`   API:      http://localhost:${qos.port}`);

    if (!options.noDashboard) {
      console.log(`   Dashboard: http://localhost:${qos.dashboardPort}`);
    }

    // Check Open Design
    const odAvailable = await checkOpenDesign();
    if (odAvailable) {
      console.log('   Design:   Open Design daemon is running');
    } else {
      console.log('   Design:   Open Design not detected (optional — install for design features)');
    }

    console.log('\n✅ Caphlon is running! Press Ctrl+C to stop.');
    console.log('\nAvailable commands in another terminal:');
    console.log('  caphlon run "..."    Run a task');
    console.log('  caphlon status       Check status');
    console.log('  caphlon design       Design pipeline');

    // Keep running until SIGINT
    await new Promise(() => {});
  } catch (err) {
    console.error('❌ Failed to start:', err instanceof Error ? err.message : String(err));
    stopQos();
    process.exit(1);
  }
}

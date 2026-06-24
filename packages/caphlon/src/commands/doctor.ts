/**
 * caphlon doctor — Diagnostics and troubleshooting
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findQosDir, findOpenDesignDir, findProjectRoot, checkOpenDesign, getStatus } from '../qos-bridge.js';

export async function doctorCommand(): Promise<void> {
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

  // Qualixar OS
  const qosDir = findQosDir();
  results.push({
    check: 'Qualixar OS',
    status: qosDir ? '✅' : '⚠️',
    detail: qosDir ? qosDir : 'Not found',
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
  } else {
    console.log('❌ Fix the errors above and run caphlon doctor again.');
  }
  console.log('');
}



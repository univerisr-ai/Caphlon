/**
 * caphlon init — Initialize a new Caphlon project
 *
 * Creates the project structure, checks dependencies,
 * and sets up the configuration file.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findProjectRoot, findQosDir, findOpenDesignDir } from '../qos-bridge.js';

const BANNER = `
╔══════════════════════════════════════════╗
║           Caphlon — Initializing         ║
║  Unified AI Agent Platform               ║
╚══════════════════════════════════════════╝
`;

export async function initCommand(options: { dir?: string; name?: string }): Promise<void> {
  const projectDir = options.dir ? join(process.cwd(), options.dir) : process.cwd();
  const projectName = options.name || 'caphlon-project';

  console.log(BANNER);
  console.log(`📁 Project: ${projectName}`);
  console.log(`📂 Directory: ${projectDir}\n`);

  // Check dependencies
  console.log('🔍 Checking components...');

  const checks: { name: string; found: boolean; message: string }[] = [
    { name: 'Qualixar OS', found: findQosDir() !== null, message: 'qualixar-os-main/' },
    { name: 'Open Design', found: findOpenDesignDir() !== null, message: 'open-design-main/' },
    { name: 'Node.js 22+', found: true, message: process.version },
    { name: 'Git', found: existsSync(join(findProjectRoot(), '.git')), message: 'repository' },
  ];

  for (const check of checks) {
    const icon = check.found ? '✅' : '⚠️';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
  }

  console.log('\n📝 Creating project structure...');

  // Create MEMORY.md
  if (!existsSync(join(projectDir, 'MEMORY.md'))) {
    writeFileSync(join(projectDir, 'MEMORY.md'), `# ${projectName} — Caphlon Memory

> Auto-maintained by Caphlon. Cross-session persistent knowledge.

## Architecture Decisions

| # | Decision | Context | Date |
|---|----------|---------|------|

## Coding Rules

- 

## Known Patterns

- 

## Common Commands

- 
`);
    console.log('  ✅ MEMORY.md created');
  }

  // Create .caphlon directory
  const caphlonDir = join(projectDir, '.caphlon');
  if (!existsSync(caphlonDir)) {
    mkdirSync(caphlonDir, { recursive: true });
    writeFileSync(join(caphlonDir, 'config.json'), JSON.stringify({
      projectName,
      version: '0.1.0',
      components: {
        qualixarOs: findQosDir() !== null,
        openDesign: findOpenDesignDir() !== null,
      },
    }, null, 2));
    console.log('  ✅ .caphlon/config.json created');
  }

  console.log('\n✅ Caphlon project initialized!');
  console.log('\nNext steps:');
  console.log('  caphlon dev        Start the agent');
  console.log('  caphlon run "..."   Run a task');
  console.log('  caphlon design     Design pipeline');
}

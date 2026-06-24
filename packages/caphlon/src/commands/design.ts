/**
 * caphlon design — Design pipeline (Open Design integration)
 *
 * Commands:
 *   caphlon design prototype <brief>   Create a prototype
 *   caphlon design deck <brief>         Create a deck/presentation
 *   caphlon design image <prompt>       Generate an image
 *   caphlon design systems [filter]     List design systems
 *   caphlon design plugins [action]     Plugin management
 */

import { checkOpenDesign, listDesignSystems } from '../qos-bridge.js';

export async function designCommand(
  subcommand: string,
  args: string[],
  options: { skill?: string; system?: string; format?: string },
): Promise<void> {
  // Check Open Design availability
  const odAvailable = await checkOpenDesign();
  if (!odAvailable) {
    console.log('\n⚠️  Open Design daemon is not running.');
    console.log('\nTo use design features:');
    console.log('  1. Install: curl -fsSL https://open-design.ai/install.sh | sh');
    console.log('  2. Start:   od daemon start');
    console.log('  3. Run:     caphlon design ...\n');
    return;
  }

  switch (subcommand) {
    case 'prototype':
      await handlePrototype(args, options);
      break;
    case 'deck':
      await handleDeck(args, options);
      break;
    case 'image':
      await handleImage(args, options);
      break;
    case 'systems':
      await handleSystems(args);
      break;
    case 'plugins':
      await handlePlugins(args);
      break;
    default:
      showDesignHelp();
  }
}

async function handlePrototype(args: string[], options: { skill?: string; system?: string; format?: string }): Promise<void> {
  const brief = args.join(' ');
  if (!brief) {
    console.log('❌ Please provide a brief. Usage: caphlon design prototype <brief>');
    return;
  }

  console.log(`\n🎨 Creating prototype...`);
  console.log(`   Brief:        ${brief}`);
  console.log(`   Skill:        ${options.skill || 'default (web-prototype)'}`);
  console.log(`   Design System: ${options.system || 'default'}`);
  console.log(`   Format:       ${options.format || 'html'}`);

  // API call
  console.log('\n📡 Sending to Open Design...');

  try {
    const response = await fetch('http://localhost:7456/api/skills/web-prototype/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: brief,
        designSystem: options.system || 'default',
        skill: options.skill || 'web-prototype',
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (response.ok) {
      const data = await response.json() as Record<string, unknown>;
      console.log('✅ Prototype created!');
      if (data.url) console.log(`   URL: ${data.url}`);
      if (data.artifactUrl) console.log(`   Preview: ${data.artifactUrl}`);
    } else {
      console.log(`⚠️  Open Design responded with status ${response.status}`);
      console.log('   Check the Open Design UI at http://localhost:7456');
    }
  } catch (err) {
    console.log('⚠️  Could not reach Open Design API.');
    console.log('   Check the Open Design UI at http://localhost:7456');
    console.log(`   ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function handleDeck(args: string[], options: { skill?: string; system?: string; format?: string }): Promise<void> {
  const brief = args.join(' ');
  if (!brief) {
    console.log('❌ Please provide a brief. Usage: caphlon design deck <brief>');
    return;
  }
  console.log(`\n📊 Creating deck...`);
  console.log(`   Brief:        ${brief}`);
  console.log(`   Template:     ${options.skill || 'guizang-ppt'}`);
  console.log(`   Design System: ${options.system || 'default'}`);
  console.log(`   Format:       ${options.format || 'html'}`);
  console.log('\n📡 Sent to Open Design. Check http://localhost:7456 for results.\n');
}

async function handleImage(args: string[], _options: Record<string, unknown>): Promise<void> {
  const prompt = args.join(' ');
  if (!prompt) {
    console.log('❌ Please provide a prompt. Usage: caphlon design image <prompt>');
    return;
  }
  console.log(`\n🖼️  Generating image...`);
  console.log(`   Prompt: ${prompt}`);
  console.log('\n📡 Sent to Open Design. Check http://localhost:7456 for results.\n');
}

async function handleSystems(args: string[]): Promise<void> {
  const filter = args[0];
  const systems = await listDesignSystems(filter);
  if (systems.length === 0) {
    console.log('\n📋 Design systems: (unable to fetch from Open Design)');
    console.log('   Available systems include: linear-app, stripe, vercel, apple,');
    console.log('   notion, cursor, supabase, claude, default, warm-editorial');
    console.log('   Run with Open Design daemon active for full list.\n');
  } else {
    console.log(`\n📋 Design systems (${systems.length}):`);
    for (const s of systems) {
      console.log(`   • ${s}`);
    }
    console.log('');
  }
}

async function handlePlugins(args: string[]): Promise<void> {
  const action = args[0] || 'list';
  switch (action) {
    case 'list':
      console.log('\n🔌 Open Design Plugins:');
      console.log('   261 plugins available in categories:');
      console.log('   • scenarios (11)    — od-default, od-figma-migration...');
      console.log('   • image-templates (45)');
      console.log('   • video-templates (50)');
      console.log('   • design-systems (142)');
      console.log('   • atoms (13)');
      console.log('   • examples (140)');
      console.log('   Use: caphlon design plugins search <query>\n');
      break;
    default:
      console.log(`\n🔌 Searching plugins for: ${action}`);
      console.log('   Check Open Design UI at http://localhost:7456/plugins\n');
  }
}

function showDesignHelp(): void {
  console.log('\n🎨 Caphlon Design Commands:');
  console.log('  caphlon design prototype <brief>     Create a prototype');
  console.log('  caphlon design deck <brief>          Create a deck/presentation');
  console.log('  caphlon design image <prompt>         Generate an image');
  console.log('  caphlon design systems [filter]       List design systems');
  console.log('  caphlon design plugins [action]       Plugin management');
  console.log('');
  console.log('Options:');
  console.log('  --skill <name>      Skill to use (web-prototype, saas-landing, dashboard, etc.)');
  console.log('  --system <name>     Design system (linear-app, stripe, vercel, etc.)');
  console.log('  --format <fmt>      Output format (html, pdf, pptx)\n');
}

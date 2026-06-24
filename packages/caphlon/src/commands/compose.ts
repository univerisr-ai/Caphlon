/**
 * caphlon compose — Compose mode (MiMo Code workflow)
 *
 * Specs-driven development in 8 stages:
 *   brainstorm → spec → implement → review → tdd → debug → verify → merge
 */

const COMPOSE_STAGES = [
  { name: 'brainstorm', emoji: '💡', desc: 'Requirements analysis & specification' },
  { name: 'spec',       emoji: '📝', desc: 'Technical specification & task breakdown' },
  { name: 'implement',  emoji: '🔨', desc: 'Write code & add tests' },
  { name: 'review',     emoji: '👁️',  desc: 'Code review & quality check' },
  { name: 'tdd',        emoji: '🧪', desc: 'Test-driven development' },
  { name: 'debug',      emoji: '🐛', desc: 'Debug & fix' },
  { name: 'verify',     emoji: '✅', desc: 'Typecheck, test, lint, build' },
  { name: 'merge',      emoji: '🔀', desc: 'Merge changes & cleanup' },
];

export async function composeCommand(
  subcommand: string,
  args: string[],
): Promise<void> {
  switch (subcommand) {
    case 'start':
      await handleComposeStart(args);
      break;
    case 'list':
      handleComposeList();
      break;
    case 'resume':
      await handleComposeResume(args);
      break;
    default:
      showComposeHelp();
  }
}

async function handleComposeStart(args: string[]): Promise<void> {
  const description = args.join(' ');
  if (!description) {
    console.log('❌ Please describe what you want to build.');
    console.log('   Usage: caphlon compose start <description>\n');
    return;
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║     Caphlon Compose — Starting Workflow   ║');
  console.log('╚══════════════════════════════════════════╝\n');
  console.log(`📋 Task: ${description}\n`);

  // Show all stages
  for (let i = 0; i < COMPOSE_STAGES.length; i++) {
    const stage = COMPOSE_STAGES[i];
    console.log(`  ${stage.emoji} Stage ${i + 1}: ${stage.name}`);
    console.log(`     ${stage.desc}`);
  }

  console.log('\n📝 Creating task list...');

  // Create .caphlon/compose/ directory
  const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const composeDir = join(process.cwd(), '.caphlon', 'compose');

  if (!existsSync(composeDir)) {
    mkdirSync(composeDir, { recursive: true });
  }

  const taskFile = join(composeDir, `task-${Date.now()}.json`);
  writeFileSync(taskFile, JSON.stringify({
    description,
    createdAt: new Date().toISOString(),
    stages: COMPOSE_STAGES.map((s, i) => ({
      ...s,
      order: i + 1,
      status: 'pending',
    })),
  }, null, 2));

  console.log(`   Task saved: ${taskFile}`);
  console.log('\n✅ Compose workflow initialized!');
  console.log('   Run each stage: caphlon compose <stage>');
  console.log('   Example: caphlon compose brainstorm\n');
}

function handleComposeList(): void {
  console.log('\n📋 Caphlon Compose — Available Stages:\n');
  for (let i = 0; i < COMPOSE_STAGES.length; i++) {
    const stage = COMPOSE_STAGES[i];
    console.log(`  ${i + 1}. ${stage.emoji} ${stage.name}`);
    console.log(`     ${stage.desc}`);
  }
  console.log('\nUsage:');
  console.log('  caphlon compose start <description>   Start a new compose workflow');
  console.log('  caphlon compose list                   List available stages');
  console.log('  caphlon compose resume <id>            Resume a saved workflow\n');
}

async function handleComposeResume(args: string[]): Promise<void> {
  const taskId = args[0];
  if (!taskId) {
    console.log('❌ Please specify a task ID.');
    console.log('   Tasks are in .caphlon/compose/\n');
    return;
  }
  console.log(`\n📂 Resuming compose task: ${taskId}\n`);
  console.log('   Caphlon Compose is ready for the next stage.');
  console.log('   Run: caphlon compose brainstorm\n');
}

function showComposeHelp(): void {
  console.log('\n📋 Caphlon Compose Commands:');
  console.log('  caphlon compose start <description>   Start a new compose workflow');
  console.log('  caphlon compose list                   List available stages');
  console.log('  caphlon compose resume <id>            Resume a saved workflow');
  console.log('');
  console.log('Stages:');
  for (const stage of COMPOSE_STAGES) {
    console.log(`  ${stage.emoji} ${stage.name} — ${stage.desc}`);
  }
  console.log('');
}

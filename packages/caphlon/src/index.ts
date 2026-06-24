/**
 * Caphlon CLI — Main entry point
 *
 * Unified command-line interface for the Caphlon AI Agent Platform.
 * Wraps Qualixar OS, Open Design, and MiMo Code into one coherent CLI.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { runTask } from './qos-bridge.js';
import { statusCommand } from './commands/status.js';
import { doctorCommand } from './commands/doctor.js';
import { designCommand } from './commands/design.js';
import { composeCommand } from './commands/compose.js';

const VERSION = '0.1.0';

export async function run(): Promise<void> {
  const program = new Command();

  program
    .name('caphlon')
    .description('Caphlon — Unified AI Agent Platform')
    .alias('caph')
    .version(VERSION, '-v, --version', 'Show version')
    .helpOption('-h, --help', 'Show help');

  // -----------------------------------------------------------------------
  // caphlon init — Initialize a new project
  // -----------------------------------------------------------------------
  program
    .command('init')
    .description('Initialize a new Caphlon project')
    .option('-d, --dir <path>', 'Project directory')
    .option('-n, --name <name>', 'Project name')
    .action(async (options) => {
      await initCommand(options);
    });

  // -----------------------------------------------------------------------
  // caphlon dev — Start the agent system
  // -----------------------------------------------------------------------
  program
    .command('dev')
    .description('Start the Caphlon agent + dashboard')
    .option('-p, --port <port>', 'API port (default: 3000)')
    .option('--dashboard-port <port>', 'Dashboard port (default: 3001)')
    .option('--no-dashboard', 'Start without dashboard')
    .action(async (options) => {
      await devCommand(options);
    });

  // -----------------------------------------------------------------------
  // caphlon run <prompt> — Run a task
  // -----------------------------------------------------------------------
  program
    .command('run')
    .description('Run a task via Caphlon agent system')
    .argument('<prompt>', 'Task description')
    .action(async (prompt: string) => {
      console.log(`\n🧠 Running task: ${prompt}\n`);
      const result = await runTask(prompt);
      if (result.success) {
        console.log('✅ Task completed!\n');
        console.log(result.output);
      } else {
        console.error('❌ Task failed:', result.error);
      }
    });

  // -----------------------------------------------------------------------
  // caphlon status — System status
  // -----------------------------------------------------------------------
  program
    .command('status')
    .description('Check system status')
    .action(async () => {
      await statusCommand();
    });

  // -----------------------------------------------------------------------
  // caphlon doctor — Diagnostics
  // -----------------------------------------------------------------------
  program
    .command('doctor')
    .description('Run system diagnostics')
    .action(async () => {
      await doctorCommand();
    });

  // -----------------------------------------------------------------------
  // caphlon design <subcommand> — Design pipeline
  // -----------------------------------------------------------------------
  const designCmd = program
    .command('design')
    .description('Design pipeline (Open Design integration)')
    .addHelpText('after', `
Examples:
  caphlon design prototype "Modern SaaS landing page"
  caphlon design deck "Q3 roadmap presentation"
  caphlon design image "Editorial hero with geometric patterns"
  caphlon design systems
  caphlon design plugins search landing-page

Options:
  --skill <name>      Skill to use (web-prototype, saas-landing, dashboard)
  --system <name>     Design system (linear-app, stripe, vercel, apple)
  --format <fmt>      Output format (html, pdf, pptx)
`);

  designCmd
    .command('prototype')
    .description('Create a web/mobile/desktop prototype')
    .argument('<brief>', 'Design brief')
    .option('--skill <name>', 'Skill to use')
    .option('--system <name>', 'Design system')
    .option('--format <fmt>', 'Output format')
    .action(async (brief, options) => {
      await designCommand('prototype', [brief], options);
    });

  designCmd
    .command('deck')
    .description('Create a deck/presentation')
    .argument('<brief>', 'Deck brief')
    .option('--skill <name>', 'Template to use')
    .option('--system <name>', 'Design system')
    .option('--format <fmt>', 'Output format')
    .action(async (brief, options) => {
      await designCommand('deck', [brief], options);
    });

  designCmd
    .command('image')
    .description('Generate an image')
    .argument('<prompt>', 'Image prompt')
    .action(async (prompt) => {
      await designCommand('image', [prompt], {});
    });

  designCmd
    .command('systems')
    .description('List available design systems')
    .argument('[filter]', 'Filter by category')
    .action(async (filter) => {
      await designCommand('systems', filter ? [filter] : [], {});
    });

  designCmd
    .command('plugins')
    .description('Plugin management')
    .argument('[action]', 'Action: list, search, info')
    .action(async (action) => {
      await designCommand('plugins', action ? [action] : [], {});
    });

  // -----------------------------------------------------------------------
  // caphlon compose <subcommand> — Compose workflow
  // -----------------------------------------------------------------------
  const composeCmd = program
    .command('compose')
    .description('Compose mode — specs-driven development workflow (MiMo Code)')
    .addHelpText('after', `
Stages:
  1. brainstorm   Requirements analysis & specification
  2. spec         Technical specification & task breakdown
  3. implement    Write code & add tests
  4. review       Code review & quality check
  5. tdd          Test-driven development
  6. debug        Debug & fix
  7. verify       Typecheck, test, lint, build
  8. merge        Merge changes & cleanup

Examples:
  caphlon compose start "Build a REST API for todos"
  caphlon compose list
`);

  composeCmd
    .command('start')
    .description('Start a new compose workflow')
    .argument('<description>', 'What to build')
    .action(async (description) => {
      await composeCommand('start', [description]);
    });

  composeCmd
    .command('list')
    .description('List compose stages')
    .action(async () => {
      await composeCommand('list', []);
    });

  composeCmd
    .command('resume')
    .description('Resume a compose workflow')
    .argument('<id>', 'Task ID')
    .action(async (id) => {
      await composeCommand('resume', [id]);
    });

  // -----------------------------------------------------------------------
  // Parse
  // -----------------------------------------------------------------------
  await program.parseAsync(process.argv);
}

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
import { connectCommand, modelCommand, disconnectCommand } from './commands/connect.js';
import { codeCommand } from './commands/code.js';
import { uiCommand } from './commands/ui.js';
import { hermesCommand } from './commands/hermes.js';
import { tokenlessCommand } from './commands/tokenless.js';
import { flowerCommand } from './commands/flower.js';
import { startCommand } from './commands/start.js';

const VERSION = '0.1.0';

export async function run(): Promise<void> {
  const program = new Command();

  program
    .name('caphlon')
    .description('Caphlon — Unified AI Agent Platform')
    .alias('caph')
    .version(VERSION, '-v, --version', 'Show version')
    .helpOption('-h, --help', 'Show help');

  // Bare `caphlon` (no subcommand) → connect a model if needed, then chat.
  program.action(async () => {
    await startCommand();
  });

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
  program
    .command('design')
    .description('Tasarım pipeline — gerçek Open Design (od) CLI, bağlı modelle')
    .argument('[args...]', 'od alt-komutu (ui, plugin, project, daemon, ...)')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon design                  od yardımını göster (tüm komutlar)
  caphlon design ui               Web arayüzünü aç
  caphlon design daemon start     Open Design daemon'ını başlat (:7456)
  caphlon design plugin list      Tasarım eklentilerini listele
`)
    .action(async (args: string[]) => {
      const ddIdx = process.argv.indexOf('--');
      const raw = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const passthrough = [...(args ?? []).filter((a) => !raw.includes(a)), ...raw];
      await designCommand(passthrough);
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
  // caphlon connect — Bind an LLM provider + API key (OpenCode-style)
  // -----------------------------------------------------------------------
  program
    .command('connect')
    .description('Bir model sağlayıcısı + API key bağla (etkileşimli sihirbaz)')
    .argument('[provider]', 'Sağlayıcı id (anthropic, openai, openrouter, ollama, ...)')
    .option('-k, --key <apiKey>', 'API key (etkileşimsiz)')
    .option('-m, --model <model>', 'Model id')
    .option('--base-url <url>', 'Özel base URL (proxy/self-host)')
    .addHelpText('after', `
Örnekler:
  caphlon connect                            Sihirbaz: sağlayıcı → key → model
  caphlon connect anthropic                  Anthropic için anahtar sor
  caphlon connect openai --key sk-... --model gpt-4o
  caphlon connect ollama                     Yerel model (anahtar gerekmez)
`)
    .action(async (provider, options) => {
      await connectCommand(provider, options);
    });

  // -----------------------------------------------------------------------
  // caphlon model — Show / list / switch the active model
  // -----------------------------------------------------------------------
  program
    .command('model')
    .description('Aktif modeli göster / listele / değiştir')
    .argument('[action]', 'list | use')
    .argument('[ref]', 'provider/model (use ile)')
    .addHelpText('after', `
Örnekler:
  caphlon model                              Aktif modeli göster
  caphlon model list                         Tüm sağlayıcı/modeller + bağlantı durumu
  caphlon model use anthropic/claude-opus-4-8
`)
    .action(async (action, ref) => {
      await modelCommand(action, ref);
    });

  // -----------------------------------------------------------------------
  // caphlon ui / tui — Launch the real OpenCode TUI (interface 1:1)
  // -----------------------------------------------------------------------
  program
    .command('ui')
    .alias('tui')
    .description('OpenCode arayüzünü başlat (birebir OpenCode TUI, bağlı modelle)')
    .argument('[project]', 'Proje dizini')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon ui                       OpenCode TUI'yi bu dizinde başlat
  caphlon ui ./my-app              Belirli projede başlat
  caphlon ui -- --continue         Ham bayrakları OpenCode'a geçir
`)
    .action(async (project: string | undefined) => {
      const ddIdx = process.argv.indexOf('--');
      const rawArgs = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const passthrough = [...(project ? [project] : []), ...rawArgs].filter(
        (a, i, arr) => arr.indexOf(a) === i,
      );
      await uiCommand(passthrough);
    });

  // -----------------------------------------------------------------------
  // caphlon code — AI pair-programming via the bundled Aider
  // -----------------------------------------------------------------------
  program
    .command('code')
    .description('AI çift-programlama — gerçek Aider ile, bağlı modeli kullanır')
    .argument('[files...]', 'Düzenlenecek dosyalar')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon code                       Aider'ı bu repoda başlat
  caphlon code src/app.ts            Belirli dosyaları aç
  caphlon code -- --message "fix x"  Ham bayrakları Aider'a geçir
`)
    .action(async (files: string[]) => {
      const ddIdx = process.argv.indexOf('--');
      const rawArgs = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const fileArgs = (files ?? []).filter((f) => !rawArgs.includes(f));
      await codeCommand(fileArgs, rawArgs);
    });

  // -----------------------------------------------------------------------
  // caphlon hermes — Hermes Agent (kendi kendine öğrenen ajan)
  // -----------------------------------------------------------------------
  program
    .command('hermes')
    .description('Hermes Agent — kendi kendine öğrenen ajan (gerçek hermes, bağlı modelle)')
    .argument('[args...]', 'Hermes alt-komutu (chat, setup, gateway, model, ...)')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon hermes                  Etkileşimli sohbet
  caphlon hermes setup            Kurulum sihirbazı
  caphlon hermes gateway start    Telegram/Discord/Slack gateway
`)
    .action(async (args: string[]) => {
      const ddIdx = process.argv.indexOf('--');
      const raw = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const passthrough = [...(args ?? []).filter((a) => !raw.includes(a)), ...raw];
      await hermesCommand(passthrough);
    });

  // -----------------------------------------------------------------------
  // caphlon tokenless — Token optimizasyonu (Rust, model gerekmez)
  // -----------------------------------------------------------------------
  program
    .command('tokenless')
    .description('LLM token optimizasyonu — gerçek tokenless binary (model gerekmez)')
    .argument('[args...]', 'tokenless alt-komutu (init, stats, compress, mcp-server, ...)')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon tokenless init            Kurulu ajanlara otomatik bağla
  caphlon tokenless stats summary   Token tasarrufunu göster
  caphlon tokenless mcp-server      MCP sunucu (stdio) olarak çalıştır
`)
    .action(async (args: string[]) => {
      const ddIdx = process.argv.indexOf('--');
      const raw = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const passthrough = [...(args ?? []).filter((a) => !raw.includes(a)), ...raw];
      await tokenlessCommand(passthrough);
    });

  // -----------------------------------------------------------------------
  // caphlon flower — Federated learning (flwr)
  // -----------------------------------------------------------------------
  program
    .command('flower')
    .alias('flwr')
    .description('Federated learning — gerçek Flower (flwr) CLI')
    .argument('[args...]', 'flwr alt-komutu (new, run, ls, login, ...)')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon flower new      Yeni Flower uygulaması şablonu
  caphlon flower run      Federated işi çalıştır
  caphlon flower ls       İşleri listele
`)
    .action(async (args: string[]) => {
      const ddIdx = process.argv.indexOf('--');
      const raw = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const passthrough = [...(args ?? []).filter((a) => !raw.includes(a)), ...raw];
      await flowerCommand(passthrough);
    });

  // -----------------------------------------------------------------------
  // caphlon disconnect — Remove a stored provider key
  // -----------------------------------------------------------------------
  program
    .command('disconnect')
    .description('Bir sağlayıcının kayıtlı anahtarını sil')
    .argument('<provider>', 'Sağlayıcı id')
    .action(async (provider) => {
      await disconnectCommand(provider);
    });

  // -----------------------------------------------------------------------
  // Parse
  // -----------------------------------------------------------------------
  await program.parseAsync(process.argv);
}

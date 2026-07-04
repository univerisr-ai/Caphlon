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
import { hiveCommand } from './commands/hive.js';
import { startCommand } from './commands/start.js';
import { skillCommand } from './commands/skill.js';
import { serveCommand } from './commands/serve.js';
import { toolsCommand } from './commands/tools.js';
import { maxCommand } from './commands/max.js';

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
    .option('--no-autostart', 'Çalışan bir sunucu yoksa otomatik başlatma')
    .action(async (prompt: string, options: { autostart?: boolean }) => {
      console.log(`\n🧠 Running task: ${prompt}`);
      console.log('   ⏳ görev çalışıyor, sonuç bekleniyor…\n');
      const result = await runTask(prompt, { autostart: options.autostart !== false });
      if (result.success) {
        console.log('✅ Task completed!\n');
        console.log(result.output);
      } else {
        console.error('❌ Task failed:', result.error);
        process.exitCode = 1;
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
    .option('--fix', 'Eksik çekirdekleri otomatik kur/derle (setup-cores) ve yeniden tanıla')
    .action(async (options: { fix?: boolean }) => {
      await doctorCommand(options);
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
    .option('--judge', 'Aktif model yerine kör-doğrulama judge modelini bağla (caphlon max)')
    .addHelpText('after', `
Örnekler:
  caphlon connect                            Sihirbaz: sağlayıcı → key → model
  caphlon connect anthropic                  Anthropic için anahtar sor
  caphlon connect openai --key sk-... --model gpt-4o
  caphlon connect ollama                     Yerel model (anahtar gerekmez)
  caphlon connect groq --judge               Kör doğrulama: max judge'ı için AYRI model
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
  // caphlon hive — Kovan Zekası (konsensüs + ortak önbellek + federated)
  // -----------------------------------------------------------------------
  program
    .command('hive')
    .alias('kovan')
    .description('Kovan Zekası — binlerce zayıf düğüm → tek güçlü cevap (konsensüs + ortak hafıza)')
    .argument('[sub]', 'serve | join | ask | train | stats | demo')
    .argument('[args...]', 'alt-komut argümanları')
    .allowUnknownOption()
    .addHelpText('after', `
Örnekler:
  caphlon hive serve              Koordinatörü başlat
  caphlon hive join --id n1       Düğüm olarak katıl
  caphlon hive ask "2+2 kactir?"  Kovana sor (konsensüs cevabı)
  caphlon hive demo               "Çok düğüm → güç" kanıtı
`)
    .action(async (sub: string | undefined, args: string[]) => {
      const ddIdx = process.argv.indexOf('--');
      const raw = ddIdx >= 0 ? process.argv.slice(ddIdx + 1) : [];
      const passthrough = [...(args ?? []).filter((a) => !raw.includes(a)), ...raw];
      await hiveCommand(sub, passthrough);
    });

  // -----------------------------------------------------------------------
  // caphlon skill — Skill deposu & öğrenme katmanı (aynı modeli güçlendirir)
  // -----------------------------------------------------------------------
  program
    .command('skill')
    .description('Skill deposu & öğrenme — GitHub skill\'lerini çek, yerelde tut, modele enjekte et')
    .argument('[action]', 'list | add | search | show | learn | sync')
    .argument('[arg]', 'repo/yol/terim/id/başlık · sync: status|push|pull')
    .argument('[repo]', 'sync push/pull için owner/repo (bir kez verilir, saklanır)')
    .option('--desc <text>', 'learn: kısa açıklama')
    .option('--when <text>', 'learn: ne zaman kullanılır')
    .option('--body <text>', 'learn: skill gövdesi')
    .addHelpText('after', `
Örnekler:
  caphlon skill list                       Yerel skill'leri göster
  caphlon skill add anthropics/skills      GitHub reposundan skill çek
  caphlon skill add ./open-design-main     Yerel dizinden ekle
  caphlon skill search "pdf tablo"         İndekste ara
  caphlon skill learn "X tuzağı" --body "..."   Bir dersi kaydet
  caphlon skill sync                       Senkron durumu + uzak depo
  caphlon skill sync push owner/repo       Öğrenilenleri git reposuna gönder
  caphlon skill sync pull                  Öğrenilenleri uzak repodan çek
`)
    .action(async (action, arg, repo, options) => {
      await skillCommand(action, arg, options, repo);
    });

  // -----------------------------------------------------------------------
  // caphlon max — Best-of-N + judge (zayıf modeli güçlendiren inference-time)
  // -----------------------------------------------------------------------
  program
    .command('max')
    .description('Best-of-N + judge ile çöz (MiMo max agent) — zayıf modeli güçlendirir')
    .argument('[task...]', 'Görev açıklaması')
    .option('-n, --candidates <n>', 'Paralel aday sayısı (varsayılan 5)')
    .addHelpText('after', `
Örnekler:
  caphlon max "kullanıcı auth'u olan REST API yaz"   5 aday + judge
  caphlon max -n 3 "şu bug'ı bul ve düzelt"           3 aday
  caphlon max                                          etkileşimli (max agent)

Kör doğrulama: caphlon connect <sağlayıcı> --judge ile AYRI bir judge modeli
bağlarsan kazananı o bağımsız model seçer (üretici kendi işini onaylayamaz).
`)
    .action(async (task: string[], options) => {
      await maxCommand((task ?? []).join(' '), options);
    });

  // -----------------------------------------------------------------------
  // caphlon serve — Yerel model gateway (LiteLLM proxy) + araç auto-link
  // -----------------------------------------------------------------------
  program
    .command('serve')
    .description('Yerel model gateway başlat (Claude Code/Codex/OpenCode buraya bağlanır)')
    .option('-p, --port <port>', 'Port (varsayılan: 4000)')
    .option('--link', 'Kurulu araçları otomatik bu gateway\'e bağla')
    .addHelpText('after', `
Örnekler:
  caphlon serve            Gateway'i başlat (OpenAI + Anthropic uyumlu)
  caphlon serve --link     Başlat + Claude Code/Codex/OpenCode'u otomatik bağla
`)
    .action(async (options) => {
      await serveCommand(options);
    });

  // -----------------------------------------------------------------------
  // caphlon tools — Cihazdaki AI araçlarını bul & gateway'e bağla
  // -----------------------------------------------------------------------
  program
    .command('tools')
    .description('Cihazdaki AI araçlarını (Claude Code, Codex, OpenCode) bul ve bağla')
    .argument('[action]', 'list | link | unlink')
    .argument('[id]', 'araç id (claude | codex | opencode)')
    .addHelpText('after', `
Örnekler:
  caphlon tools            Kurulu araçları + bağlantı durumunu göster
  caphlon tools link       Hepsini gateway'e bağla (yedekli, geri alınabilir)
  caphlon tools link claude  Sadece Claude Code'u bağla
  caphlon tools unlink     Tüm bağlantıları kaldır (yedekten geri al)
`)
    .action(async (action, id) => {
      await toolsCommand(action, id);
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

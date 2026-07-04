/**
 * caphlon connect / model / disconnect
 *
 * OpenCode-style model + API-key binding. Connects an LLM provider to the
 * Caphlon platform, stores the key encrypted, and selects the active model.
 *
 *   caphlon connect                      Interactive wizard (pick provider → key → model)
 *   caphlon connect openai --key sk-...  Non-interactive
 *   caphlon connect ollama               Local provider, no key needed
 *   caphlon model                        Show the active model
 *   caphlon model list                   List providers + connection status
 *   caphlon model use anthropic/claude-opus-4-8
 *   caphlon disconnect openai            Remove a stored key
 */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import { PROVIDERS, getProvider, resolveModelRef, type ProviderInfo } from '../config/providers.js';
import {
  loadConfig,
  saveConfig,
  setCredential,
  getCredential,
  removeCredential,
  connectedProviders,
  maskKey,
} from '../config/store.js';

interface ConnectOptions {
  key?: string;
  model?: string;
  baseUrl?: string;
  /** Aktif model yerine kör-doğrulama judge modelini bağla (caphlon max için). */
  judge?: boolean;
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// caphlon connect
// ---------------------------------------------------------------------------

export async function connectCommand(
  providerArg: string | undefined,
  options: ConnectOptions,
): Promise<void> {
  let provider: ProviderInfo | undefined = providerArg ? getProvider(providerArg) : undefined;

  // 1. Pick provider (interactive if not given)
  if (!provider) {
    if (providerArg) {
      console.error(chalk.red(`✖ Bilinmeyen sağlayıcı: ${providerArg}`));
      console.log(`  Mevcut: ${PROVIDERS.map((p) => p.id).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.log(chalk.bold('\n🔌 Caphlon — Model Bağlantısı\n'));
    PROVIDERS.forEach((p, i) => {
      const tag = connectedProviders().includes(p.id) ? chalk.green(' ✓ bağlı') : '';
      console.log(`  ${chalk.cyan(String(i + 1).padStart(2))}. ${p.name}${tag}`);
    });
    const choice = await ask(chalk.bold('\nSağlayıcı seç (numara veya id): '));
    const byIndex = PROVIDERS[Number(choice) - 1];
    provider = byIndex ?? getProvider(choice);
    if (!provider) {
      console.error(chalk.red('✖ Geçersiz seçim.'));
      process.exitCode = 1;
      return;
    }
  }

  console.log(chalk.bold(`\n→ ${provider.name}`));

  // 2. API key
  if (provider.needsKey) {
    let key = options.key ?? getCredential(provider.id) ?? '';
    if (options.key) {
      key = options.key;
    } else if (key) {
      console.log(chalk.gray(`  Kayıtlı anahtar bulundu (${maskKey(key)}). Boş bırak = koru.`));
      const entered = await ask(`  ${provider.name} API key: `);
      if (entered) key = entered;
    } else {
      console.log(chalk.gray(`  Anahtar al: ${provider.keysUrl}`));
      key = await ask(`  ${provider.name} API key: `);
    }
    if (!key) {
      console.error(chalk.red('✖ API key gerekli.'));
      process.exitCode = 1;
      return;
    }
    if (provider.keyPrefix && !key.startsWith(provider.keyPrefix)) {
      console.log(
        chalk.yellow(`  ⚠ Anahtar genelde "${provider.keyPrefix}" ile başlar — yine de kaydediliyor.`),
      );
    }
    setCredential(provider.id, key);
    console.log(chalk.green(`  ✓ Anahtar şifrelenip kaydedildi (${maskKey(key)}).`));
  } else {
    console.log(chalk.gray(`  ${provider.name} yerel çalışır — API key gerekmez.`));
  }

  // 3. Model
  let model = options.model;
  if (!model) {
    console.log(chalk.bold('\n  Model seç:'));
    provider.models.forEach((m, i) => {
      console.log(`    ${chalk.cyan(String(i + 1))}. ${m.label} ${chalk.gray(`(${m.id})`)}`);
    });
    const mChoice = await ask(`  Model (numara/id, boş = ${provider.models[0]!.id}): `);
    if (!mChoice) {
      model = provider.models[0]!.id;
    } else {
      const byIdx = provider.models[Number(mChoice) - 1];
      model = byIdx ? byIdx.id : mChoice;
    }
  }

  // 4. Persist selection
  const cfg = loadConfig();
  if (!options.judge) {
    cfg.providers[provider.id] = {
      model,
      baseUrl: options.baseUrl ?? cfg.providers[provider.id]?.baseUrl,
    };
    cfg.activeProvider = provider.id;
    cfg.activeModel = model;
    saveConfig(cfg);
    console.log(
      chalk.green(`\n✅ Bağlandı: ${chalk.bold(`${provider.id}/${model}`)} aktif model olarak ayarlandı.`),
    );
    console.log(chalk.gray('   "caphlon model" ile kontrol et, "caphlon run" ile kullan.\n'));
    return;
  }

  // --judge: aktif modele DOKUNMADAN ayrı judge modelini bağla (kör doğrulama).
  cfg.judgeProvider = provider.id;
  cfg.judgeModel = model;
  saveConfig(cfg);
  console.log(
    chalk.green(`\n⚖️  Judge bağlandı: ${chalk.bold(`${provider.id}/${model}`)} (kör doğrulama).`),
  );
  console.log(
    chalk.gray('   caphlon max artık kazananı bu BAĞIMSIZ modelle seçer — üretici kendi işini onaylayamaz.\n'),
  );
}

// ---------------------------------------------------------------------------
// caphlon model [list|use]
// ---------------------------------------------------------------------------

export async function modelCommand(action: string | undefined, ref: string | undefined): Promise<void> {
  if (action === 'list') {
    console.log(chalk.bold('\n📚 Sağlayıcılar & Modeller\n'));
    const connected = connectedProviders();
    const cfg = loadConfig();
    for (const p of PROVIDERS) {
      const isConn = connected.includes(p.id);
      const status = isConn
        ? chalk.green('✓ bağlı')
        : p.needsKey
          ? chalk.gray('○ bağlı değil')
          : chalk.yellow('○ yerel');
      console.log(`${chalk.cyan(p.id.padEnd(12))} ${p.name.padEnd(18)} ${status}`);
      for (const m of p.models) {
        const active = cfg.activeProvider === p.id && cfg.activeModel === m.id;
        const mark = active ? chalk.green(' ◀ aktif') : '';
        console.log(`   ${chalk.gray(m.id)}${mark}`);
      }
    }
    console.log('');
    return;
  }

  if (action === 'use') {
    if (!ref) {
      console.error(chalk.red('✖ Kullanım: caphlon model use <provider/model>'));
      process.exitCode = 1;
      return;
    }
    const resolved = resolveModelRef(ref);
    if (!resolved) {
      console.error(chalk.red(`✖ Bilinmeyen sağlayıcı: ${ref.split('/')[0]}`));
      process.exitCode = 1;
      return;
    }
    const { provider, model } = resolved;
    if (provider.needsKey && !getCredential(provider.id)) {
      console.error(
        chalk.red(`✖ ${provider.name} bağlı değil. Önce: caphlon connect ${provider.id}`),
      );
      process.exitCode = 1;
      return;
    }
    const cfg = loadConfig();
    cfg.providers[provider.id] = { model, baseUrl: cfg.providers[provider.id]?.baseUrl };
    cfg.activeProvider = provider.id;
    cfg.activeModel = model;
    saveConfig(cfg);
    console.log(chalk.green(`✅ Aktif model: ${chalk.bold(`${provider.id}/${model}`)}`));
    return;
  }

  // Default: show current
  const cfg = loadConfig();
  if (!cfg.activeProvider || !cfg.activeModel) {
    console.log(chalk.yellow('\n⚠ Aktif model yok. "caphlon connect" ile bir model bağla.\n'));
    return;
  }
  const p = getProvider(cfg.activeProvider);
  const hasKey = p && (!p.needsKey || getCredential(p.id));
  console.log(chalk.bold('\n🧠 Aktif Model'));
  console.log(`   Sağlayıcı : ${cfg.activeProvider}`);
  console.log(`   Model     : ${cfg.activeModel}`);
  console.log(`   Anahtar   : ${hasKey ? chalk.green('✓ bağlı') : chalk.red('✖ eksik')}`);
  if (cfg.judgeProvider && cfg.judgeModel) {
    console.log(chalk.bold('\n⚖️  Judge Modeli (kör doğrulama — caphlon max)'));
    console.log(`   Sağlayıcı : ${cfg.judgeProvider}`);
    console.log(`   Model     : ${cfg.judgeModel}`);
  } else {
    console.log(chalk.gray('\n   Judge modeli yok — caphlon max judge\'ı aktif modelle çalışır.'));
    console.log(chalk.gray('   Bağımsız doğrulama için:  caphlon connect <sağlayıcı> --judge'));
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// caphlon disconnect <provider>
// ---------------------------------------------------------------------------

export async function disconnectCommand(providerArg: string): Promise<void> {
  const provider = getProvider(providerArg);
  if (!provider) {
    console.error(chalk.red(`✖ Bilinmeyen sağlayıcı: ${providerArg}`));
    process.exitCode = 1;
    return;
  }
  removeCredential(provider.id);
  const cfg = loadConfig();
  delete cfg.providers[provider.id];
  if (cfg.activeProvider === provider.id) {
    cfg.activeProvider = null;
    cfg.activeModel = null;
  }
  if (cfg.judgeProvider === provider.id) {
    cfg.judgeProvider = null;
    cfg.judgeModel = null;
  }
  saveConfig(cfg);
  console.log(chalk.green(`✅ ${provider.name} bağlantısı kesildi (anahtar silindi).`));
}

/**
 * caphlon serve — Yerel model gateway (gerçek LiteLLM proxy).
 *
 * Caphlon'a bağlı modeli (caphlon connect) OpenAI-uyumlu (/v1) ve
 * Anthropic-uyumlu (/v1/messages) bir yerel uç noktada sunar. Böylece Claude
 * Code, Codex, OpenCode gibi araçlar tek bir adrese bağlanıp caphlon'un modelini
 * kullanır. No-rewrite: proxy'yi biz yazmayız; aider-venv'deki litellm'i çalıştırırız.
 *
 * `--link` ile başlatınca cihazdaki kurulu araçları otomatik bu gateway'e bağlar.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { getActiveModel, aiderModelString } from '../config/active.js';
import { DEFAULT_GATEWAY, detectTools, getAdapter } from '../config/tools.js';

function litellmBin(): string | null {
  const p = resolve(import.meta.dirname, '..', '..', '..', '..', 'core', 'aider-venv', 'bin', 'litellm');
  return existsSync(p) ? p : null;
}

export async function serveCommand(opts: { port?: string; link?: boolean }): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }
  const bin = litellmBin();
  if (!bin) {
    console.error(chalk.red('✖ LiteLLM bulunamadı (core/aider-venv).'));
    console.log(chalk.gray('  Kur:  core/aider-venv/bin/python -m pip install "litellm[proxy]"'));
    process.exitCode = 1;
    return;
  }

  const port = opts.port ?? '4000';
  const gateway = `http://127.0.0.1:${port}`;
  const model = aiderModelString(active);

  // İstenirse: kurulu araçları otomatik bu gateway'e bağla.
  if (opts.link) {
    linkAll(gateway, model);
  }

  console.log(chalk.bold(`\n🌐 Caphlon Gateway — ${chalk.cyan(model)}`));
  console.log(chalk.gray(`   ${active.provider.id}/${active.model} → ${gateway}`));
  console.log(chalk.gray(`   OpenAI:    ${gateway}/v1`));
  console.log(chalk.gray(`   Anthropic: ${gateway}  (/v1/messages)\n`));
  if (!opts.link) {
    console.log(chalk.gray('   Araçları otomatik bağlamak için:  caphlon tools link  (veya: caphlon serve --link)\n'));
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (active.apiKey) env[active.provider.envVar] = active.apiKey;
  if (active.provider.id === 'ollama') env.OLLAMA_API_BASE = active.baseUrl;

  // litellm proxy'yi çalıştır (bloklar — Ctrl+C ile durur).
  const child = spawnSync(bin, ['--model', model, '--host', '127.0.0.1', '--port', port], {
    stdio: 'inherit',
    env,
  });
  if (child.status && child.status !== 0) process.exitCode = child.status;
}

function linkAll(gateway: string, model: string): void {
  const tools = detectTools().filter((t) => t.installed);
  if (tools.length === 0) {
    console.log(chalk.yellow('   Bağlanacak kurulu araç bulunamadı.'));
    return;
  }
  for (const t of tools) {
    try {
      getAdapter(t.id)!.link(gateway, model);
      console.log(chalk.green(`   ✓ ${t.name} bağlandı (${t.configPath})`));
    } catch (e) {
      console.log(chalk.red(`   ✖ ${t.name}: ${(e as Error).message}`));
    }
  }
}

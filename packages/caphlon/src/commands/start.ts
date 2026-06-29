/**
 * caphlon (no subcommand) — the default experience.
 *
 * Typing just `caphlon` should be enough: connect an API/model if needed,
 * then drop straight into the AI chat (OpenCode TUI). Mirrors how bare
 * `opencode` launches its TUI.
 */

import chalk from 'chalk';
import { getActiveModel } from '../config/active.js';
import { connectCommand } from './connect.js';
import { uiCommand } from './ui.js';

export async function startCommand(): Promise<void> {
  console.log(
    chalk.bold.cyan(`
   ⚡ Caphlon  — Unified AI Agent Platform
`),
  );

  // 1. Ensure a model + API key is connected.
  let active = getActiveModel();
  if (!active) {
    console.log(chalk.yellow('Henüz bir model bağlı değil. Önce hızlı kurulum:\n'));
    await connectCommand(undefined, {});
    active = getActiveModel();
    if (!active) {
      // Wizard cancelled or failed — nothing more to do.
      return;
    }
  } else {
    console.log(
      chalk.gray(`Aktif model: ${chalk.bold(`${active.provider.id}/${active.model}`)}  `) +
        chalk.gray('(değiştirmek için: caphlon model use ...)\n'),
    );
  }

  // 2. Launch the AI chat (real OpenCode TUI) with the connected model.
  console.log(chalk.gray('AI sohbeti açılıyor...'));
  await uiCommand([]);
}

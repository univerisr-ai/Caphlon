/**
 * Caphlon TUI — Terminal Renderer
 *
 * ANSI-based rendering engine for the Caphlon terminal interface.
 * Draws header, chat area, input line, and status bar.
 */

import chalk from 'chalk';
import type { CaphlonMode } from './auto-mode.js';
import { modeIcon, modeLabel, modeColor } from './auto-mode.js';

// ── Terminal Control ────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

function cursorHide(): string { return `${CSI}?25l`; }
function cursorShow(): string { return `${CSI}?25h`; }
function cursorTo(row: number, col: number): string { return `${CSI}${row};${col}H`; }
function clearLine(): string { return `${CSI}2K`; }
function clearScreen(): string { return `${CSI}2J`; }
function eraseDown(): string { return `${CSI}J`; }

// ── Dimensions ──────────────────────────────────────────

export interface TermSize {
  rows: number;
  cols: number;
}

export function getTermSize(): TermSize {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

// ── Theme ────────────────────────────────────────────────

const THEME = {
  primary: '#6366f1',
  secondary: '#a855f7',
  accent: '#22c55e',
  muted: '#6b7280',
  border: '#374151',
  bg: '#0a0a0f',
  surface: '#111118',
  text: '#e5e7eb',
  textDim: '#9ca3af',
  error: '#ef4444',
  warning: '#f59e0b',
};

// ── Component Dimensions ────────────────────────────────

const HEADER_HEIGHT = 3;
const INPUT_HEIGHT = 3;
const STATUS_HEIGHT = 1;
const SIDE_PADDING = 2;

// ── Screen Buffer ───────────────────────────────────────

class ScreenBuffer {
  private lines: string[] = [];

  clear(): void {
    this.lines = [];
  }

  write(text: string): void {
    this.lines.push(text);
  }

  render(targetStart: number): string {
    const size = getTermSize();
    const available = size.rows - targetStart - STATUS_HEIGHT;
    const visible = this.lines.slice(-available);
    return visible.join('\n');
  }

  get height(): number {
    return this.lines.length;
  }
}

// ── Component Renderers ─────────────────────────────────

function renderHeader(mode: CaphlonMode, hasKey: boolean): string[] {
  const size = getTermSize();
  const lines: string[] = [];

  // Gradient logo text
  const logo = chalk.hex(THEME.primary).bold('⚡ Caphlon');
  const version = chalk.hex(THEME.muted)('v0.1.0');
  const modeStr = chalk.hex(modeColor(mode))(`${modeIcon(mode)} ${modeLabel(mode)}`);
  const keyStatus = hasKey
    ? chalk.hex(THEME.accent)('🔑 Key set')
    : chalk.hex(THEME.warning)('⚠ No API key');

  // Top border
  const topBorder = chalk.hex(THEME.border)('┌' + '─'.repeat(size.cols - 2) + '┐');
  lines.push(topBorder);

  // Header content
  const leftSide = ` ${logo}  ${version} `;
  const rightSide = ` ${modeStr}  │  ${keyStatus} `;
  const padding = size.cols - leftSide.length - rightSide.length - 2;
  const midContent = leftSide + ' '.repeat(Math.max(0, padding)) + rightSide;
  lines.push(chalk.hex(THEME.border)('│') + midContent + chalk.hex(THEME.border)('│'));

  // Bottom border
  const bottomBorder = chalk.hex(THEME.border)('└' + '─'.repeat(size.cols - 2) + '┘');
  lines.push(bottomBorder);

  return lines;
}

function renderStatusBar(mode: CaphlonMode, message: string): string {
  const size = getTermSize();
  const status = chalk.hex(THEME.textDim)(` ${modeIcon(mode)} ${modeLabel(mode)}  │  ${message} `);
  const rightInfo = chalk.hex(THEME.muted)(' /help  Ctrl+C to exit ');
  const padding = size.cols - status.length - rightInfo.length;
  const content = status + ' '.repeat(Math.max(0, padding)) + rightInfo;
  return chalk.hex(THEME.border)('├') + '─'.repeat(size.cols - 2) + chalk.hex(THEME.border)('┤') + '\n' +
         chalk.hex(THEME.border)('│') + content + chalk.hex(THEME.border)('│');
}

function renderInput(prompt: string, cursor: number): string {
  const size = getTermSize();
  const prefix = chalk.hex(THEME.primary)('▶');
  const inputWidth = size.cols - 6;

  let display = prompt;
  if (display.length > inputWidth) {
    display = display.slice(display.length - inputWidth);
  }

  const padding = ' '.repeat(Math.max(0, inputWidth - display.length));
  const border = chalk.hex(THEME.border)('│');
  return border + ` ${prefix} ${display}${padding} ${border}`;
}

// ── Main Renderer ───────────────────────────────────────

export function renderScreen(
  mode: CaphlonMode,
  messages: string[],
  input: string,
  cursorPos: number,
  hasApiKey: boolean,
  statusMsg: string,
): void {
  const size = getTermSize();

  // Clear and move to top
  let output = cursorTo(1, 1) + clearScreen();

  // Render header
  const header = renderHeader(mode, hasApiKey);
  for (let i = 0; i < header.length; i++) {
    output += cursorTo(i + 1, 1) + header[i];
  }

  // Render chat/messages area
  const chatStart = HEADER_HEIGHT + 1;
  const chatEnd = size.rows - STATUS_HEIGHT - INPUT_HEIGHT - 1;
  const chatHeight = chatEnd - chatStart + 1;

  // Take last N messages that fit
  const visibleMessages = messages.slice(-chatHeight);

  // Clear chat area
  for (let i = chatStart; i <= chatEnd; i++) {
    output += cursorTo(i, 1) + clearLine() + chalk.hex(THEME.border)('│') +
              ' '.repeat(size.cols - 2) + chalk.hex(THEME.border)('│');
  }

  // Draw messages
  for (let i = 0; i < visibleMessages.length; i++) {
    const row = chatStart + i;
    const msg = visibleMessages[i];
    // Truncate if too long
    const maxContent = size.cols - 4;
    const display = msg.length > maxContent ? msg.slice(0, maxContent - 1) + '…' : msg;
    output += cursorTo(row, 3) + chalk.hex(THEME.text)(display);
  }

  // Render input area
  const inputRow = size.rows - STATUS_HEIGHT - INPUT_HEIGHT;
  // Draw input box top
  output += cursorTo(inputRow, 1) + chalk.hex(THEME.border)('├' + '─'.repeat(size.cols - 2) + '┤');
  // Draw input line
  output += cursorTo(inputRow + 1, 1) + renderInput(input, cursorPos);
  // Draw input box bottom
  output += cursorTo(inputRow + 2, 1) + chalk.hex(THEME.border)('└' + '─'.repeat(size.cols - 2) + '┘');

  // Render status bar
  output += cursorTo(size.rows, 1) + renderStatusBar(mode, statusMsg);

  // Position cursor on input line
  const inputContentStart = 5; // "│ ▶ " prefix
  const cursorScreen = Math.min(inputContentStart + cursorPos, size.cols - 3);
  output += cursorTo(inputRow + 1, cursorScreen);

  process.stdout.write(output);
}

export function renderWelcome(): void {
  const size = getTermSize();
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.hex(THEME.primary)('  ⚡  CAPHLON'));
  lines.push(chalk.hex(THEME.muted)('  ─────────────────────────────────'));
  lines.push('');
  lines.push(chalk.hex(THEME.textDim)('  Unified AI Agent Platform'));
  lines.push(chalk.hex(THEME.textDim)('  Qualixar OS + Open Design + MiMo Code'));
  lines.push('');
  lines.push(chalk.hex(THEME.muted)('  v0.1.0'));
  lines.push('');

  const content = lines.join('\n');
  const output = clearScreen() + cursorTo(1, 1) + content;
  process.stdout.write(output);
}

// ── Raw mode helpers ────────────────────────────────────

export function enableRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write(cursorHide());
  }
}

export function disableRawMode(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write(cursorShow());
  }
}

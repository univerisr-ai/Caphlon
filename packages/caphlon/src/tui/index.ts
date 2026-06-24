/**
 * Caphlon TUI — Main Interactive Loop
 *
 * Persistent terminal UI with:
 * - Header with branding + status
 * - Chat/response area
 * - Input with history
 * - Auto mode detection
 * - API key management
 */

import chalk from 'chalk';
import { loadConfig, getApiKey, setApiKey, isFirstRun, markConfigured, saveConfig } from './config.js';
import { detectMode, type CaphlonMode, modeIcon, modeLabel } from './auto-mode.js';
import { renderScreen, enableRawMode, disableRawMode, getTermSize } from './renderer.js';

// ── ANSI Constants ──────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

function cursorTo(row: number, col: number): string { return `${CSI}${row};${col}H`; }
function clearScreen(): string { return `${CSI}2J`; }
function clearBelow(): string { return `${CSI}J`; }

// ── State ────────────────────────────────────────────────

interface TuiState {
  mode: CaphlonMode;
  input: string;
  cursor: number;
  messages: string[];
  history: string[];
  historyIndex: number;
  hasApiKey: boolean;
  statusMsg: string;
  running: boolean;
}

function createInitialState(): TuiState {
  return {
    mode: 'general',
    input: '',
    cursor: 0,
    messages: [],
    history: [],
    historyIndex: -1,
    hasApiKey: false,
    statusMsg: 'Ready',
    running: true,
  };
}

// ── Helpers ──────────────────────────────────────────────

const THEME = {
  primary: '#6366f1',
  secondary: '#a855f7',
  accent: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  textDim: '#9ca3af',
};

function writeLine(text: string): void {
  process.stdout.write(text + '\n');
}

function appendMessage(state: TuiState, msg: string): void {
  state.messages.push(msg);
}

function formatAiResponse(text: string, mode: CaphlonMode): string {
  const icon = modeIcon(mode);
  // Process code blocks
  const lines = text.split('\n');
  const result: string[] = [];
  let inCode = false;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      if (inCode) {
        result.push(chalk.hex(THEME.textDim)('  ┌─ Code ──────────────────────────────'));
      } else {
        result.push(chalk.hex(THEME.textDim)('  └─────────────────────────────────────'));
      }
      continue;
    }
    if (inCode) {
      result.push(chalk.hex('#e5e7eb')('  │ ') + chalk.hex('#d1d5db')(line));
    } else {
      // Normal text, wrap nicely
      result.push('  ' + chalk.hex('#e5e7eb')(line));
    }
  }

  return result.join('\n');
}

// ── Commands ─────────────────────────────────────────────

async function handleCommand(state: TuiState, cmd: string): Promise<void> {
  const parts = cmd.trim().split(/\s+/);
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/help':
    case '/h':
      appendMessage(state, chalk.hex(THEME.textDim)('  ── Commands ──────────────────────────'));
      appendMessage(state, chalk.hex(THEME.textDim)('  /help, /h     Show this help'));
      appendMessage(state, chalk.hex(THEME.textDim)('  /mode <mode>  Switch mode (design|compose|code|analyze|general)'));
      appendMessage(state, chalk.hex(THEME.textDim)('  /key          Set/change API key'));
      appendMessage(state, chalk.hex(THEME.textDim)('  /clear, /c    Clear screen'));
      appendMessage(state, chalk.hex(THEME.textDim)('  /status, /s   Show system status'));
      appendMessage(state, chalk.hex(THEME.textDim)('  /exit, /q     Exit Caphlon'));
      appendMessage(state, chalk.hex(THEME.textDim)('  ─────────────────────────────────────'));
      break;

    case '/mode': {
      const target = parts[1]?.toLowerCase() as CaphlonMode;
      const validModes: CaphlonMode[] = ['design', 'compose', 'code', 'analyze', 'general'];
      if (validModes.includes(target)) {
        state.mode = target;
        appendMessage(state, chalk.hex(THEME.accent)(`  ${modeIcon(target)} Switched to ${modeLabel(target)} mode`));
      } else {
        appendMessage(state, chalk.hex(THEME.error)(`  Unknown mode: ${target}. Try: ${validModes.join(', ')}`));
      }
      break;
    }

    case '/key': {
      appendMessage(state, chalk.hex(THEME.textDim)('  Enter your API key:'));
      state.statusMsg = 'Waiting for API key...';
      // The key input will be handled by the main loop
      break;
    }

    case '/clear':
    case '/c':
      state.messages = [];
      break;

    case '/status':
    case '/s':
      appendMessage(state, chalk.hex(THEME.textDim)('  ── Caphlon Status ────────────────────'));
      appendMessage(state, `  Mode: ${modeIcon(state.mode)} ${modeLabel(state.mode)}`);
      appendMessage(state, `  API Key: ${state.hasApiKey ? chalk.hex(THEME.accent)('✓ Set') : chalk.hex(THEME.warning)('✗ Not set')}`);
      appendMessage(state, chalk.hex(THEME.textDim)('  ─────────────────────────────────────'));
      break;

    case '/exit':
    case '/q':
      appendMessage(state, chalk.hex(THEME.textDim)('  Goodbye! 👋'));
      state.running = false;
      break;

    default:
      appendMessage(state, chalk.hex(THEME.error)(`  Unknown command: ${command}. Type /help for available commands.`));
  }
}

// ── Process Prompt ───────────────────────────────────────

async function processPrompt(state: TuiState, prompt: string): Promise<void> {
  // Auto-detect mode from prompt
  const detected = detectMode(prompt);
  state.mode = detected;

  // Add user message
  const userPrefix = chalk.hex(THEME.primary)('  You');
  appendMessage(state, `${userPrefix} › ${prompt}`);

  // Update status
  state.statusMsg = `${modeIcon(state.mode)} ${modeLabel(state.mode)} — Processing...`;

  // Simulated AI response for now (real agent integration TBD)
  const response = generateResponse(prompt, state.mode);
  const aiPrefix = chalk.hex(THEME.secondary)(`  ${modeIcon(state.mode)} Caphlon`);
  appendMessage(state, `${aiPrefix}:\n${formatAiResponse(response, state.mode)}`);

  state.statusMsg = 'Ready';
}

// ── Mock AI Response (temp until real agent integration) ─

function generateResponse(prompt: string, mode: CaphlonMode): string {
  switch (mode) {
    case 'design':
      return `I'll help you design that! Here's my approach:\n\n1. Analyze your brief: "${prompt}"\n2. Select appropriate design system\n3. Generate prototype/visual\n4. Refine based on feedback\n\nTo get started, use:\n  caphlon design prototype "${prompt}"`;
    case 'compose':
      return `I'll compose this for you! Here's my plan:\n\n1. **Brainstorm** — Requirements analysis\n2. **Spec** — Technical specification\n3. **Implement** — Write code & tests\n4. **Review** — Code review & quality\n5. **TDD** — Test-driven development\n6. **Debug** — Debug & fix\n7. **Verify** — Typecheck, test, lint\n8. **Merge** — Merge & cleanup\n\nRun: \`caphlon compose start "${prompt}"\``;
    case 'code':
      return `Let me help you with that code task!\n\nI'll analyze the request and write clean, well-structured code.\n\nFor this task, I recommend:\n- Following TypeScript best practices\n- Adding proper error handling\n- Including unit tests\n- Documenting the API\n\nRun: \`caphlon run "${prompt}"\``;
    case 'analyze':
      return `Analyzing: "${prompt}"\n\nI'll examine this thoroughly and provide insights.\n\n**Key areas to investigate:**\n- Code structure & complexity\n- Potential security concerns\n- Performance characteristics\n- Maintainability & best practices`;
    case 'general':
      return `I understand you want to: "${prompt}"\n\nI can help you with this! Based on your request, here are some options:\n- Run as a task: \`caphlon run "${prompt}"\`\n- Let me auto-detect the best mode\n- Or specify a mode: /mode [design|compose|code|analyze]`;
  }
}

// ── API Key Input Handler ────────────────────────────────

async function handleApiKeyInput(state: TuiState, key: string): Promise<void> {
  if (key.length < 8) {
    appendMessage(state, chalk.hex(THEME.error)('  API key too short. Please enter a valid key.'));
    state.statusMsg = 'Ready';
    return;
  }

  await setApiKey(key);
  state.hasApiKey = true;
  appendMessage(state, chalk.hex(THEME.accent)('  ✅ API key saved to ~/.caphlon/config.json'));
  state.statusMsg = 'Ready';
}

// ── Main TUI Entry ───────────────────────────────────────

export async function startTui(): Promise<void> {
  const state = createInitialState();

  // ── First-time setup ──────────────────────────────────
  const config = await loadConfig();
  state.hasApiKey = !!config.apiKey;
  state.mode = 'general';

  // ── Terminal Setup ────────────────────────────────────
  enableRawMode();

  const stdin = process.stdin;
  const stdout = process.stdout;

  // Handle Ctrl+C
  const onSigint = () => {
    disableRawMode();
    process.exit(0);
  };
  process.on('SIGINT', onSigint);

  // Handle resize
  const onResize = () => {
    renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
  };
  process.stdout.on('resize', onResize);

  // ── First-run welcome ────────────────────────────────
  stdout.write(clearScreen() + cursorTo(1, 1));

  if (!state.hasApiKey) {
    appendMessage(state, chalk.hex(THEME.textDim)('  ╔══════════════════════════════════════════╗'));
    appendMessage(state, chalk.hex(THEME.textDim)('  ║     Welcome to ⚡ Caphlon v0.1.0!         ║'));
    appendMessage(state, chalk.hex(THEME.textDim)('  ╚══════════════════════════════════════════╝'));
    appendMessage(state, '');
    appendMessage(state, chalk.hex(THEME.textDim)('  First time setup: Please enter your API key.'));
    appendMessage(state, chalk.hex(THEME.textDim)('  (Type your key and press Enter, or type "skip")'));
    state.statusMsg = 'WAITING FOR API KEY...';

    renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);

    // Collect API key
    let keyBuffer = '';
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === 3) { // Ctrl+C
          disableRawMode();
          process.exit(0);
        } else if (byte === 13) { // Enter
          stdin.removeListener('data', onData);
          const key = keyBuffer.trim();
          if (key.toLowerCase() === 'skip' || key === '') {
            appendMessage(state, chalk.hex(THEME.warning)('  ⚠ Skipped. You can set it later with /key'));
            markConfigured();
          } else {
            handleApiKeyInput(state, key);
          }
          state.statusMsg = 'Ready';
          renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
          mainLoop();
          return;
        } else if (byte === 127 || byte === 8) { // Backspace
          keyBuffer = keyBuffer.slice(0, -1);
        } else if (byte >= 32 && byte <= 126) {
          keyBuffer += String.fromCharCode(byte);
        }
        // Show masked key
        state.input = '•'.repeat(keyBuffer.length) + (keyBuffer.length > 0 ? ' ' : '');
        state.cursor = state.input.length;
        renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
      }
    };

    stdin.on('data', onData);
  } else {
    appendMessage(state, chalk.hex(THEME.accent)('  ⚡ Caphlon ready — how can I help you?'));
    appendMessage(state, chalk.hex(THEME.textDim)('  Type /help for available commands.'));
    renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
    mainLoop();
  }

  // ── Main Input Loop ──────────────────────────────────
  function mainLoop(): void {
    let inputBuffer = '';
    let expectingKey = false;

    stdin.on('data', (chunk: Buffer) => {
      for (const byte of chunk) {
        if (!state.running) {
          disableRawMode();
          stdout.write(clearScreen() + cursorTo(1, 1));
          process.exit(0);
          return;
        }

        if (byte === 3) { // Ctrl+C
          if (inputBuffer.length > 0) {
            inputBuffer = '';
            state.input = '';
            state.cursor = 0;
            renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
          } else if (state.messages.length <= 1) {
            disableRawMode();
            stdout.write(clearScreen() + cursorTo(1, 1));
            process.exit(0);
          } else {
            appendMessage(state, chalk.hex(THEME.textDim)('  Press Ctrl+C again to exit, or type a command.'));
            state.statusMsg = 'Press Ctrl+C again to exit';
            renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
            state.statusMsg = 'Ready';
          }
          return;
        }

        if (byte === 13) { // Enter
          const line = inputBuffer.trim();
          inputBuffer = '';
          state.input = '';
          state.cursor = 0;

          if (line === '') {
            renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
            return;
          }

          // Add to history
          state.history.push(line);
          state.historyIndex = state.history.length;

          // Check if it's a command
          if (line.startsWith('/')) {
            handleCommand(state, line);
            renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
            return;
          }

          // Process as prompt
          processPrompt(state, line).then(() => {
            renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
          });
          return;
        }

        if (byte === 27) { // Escape sequence
          // Read next two bytes for arrow keys
          const next1 = chunk[1];
          const next2 = chunk[2];
          if (next1 === 91) { // [
            if (next2 === 65) { // Up arrow
              if (state.historyIndex > 0) {
                state.historyIndex--;
                inputBuffer = state.history[state.historyIndex];
                state.input = inputBuffer;
                state.cursor = inputBuffer.length;
              }
            } else if (next2 === 66) { // Down arrow
              if (state.historyIndex < state.history.length - 1) {
                state.historyIndex++;
                inputBuffer = state.history[state.historyIndex];
                state.input = inputBuffer;
                state.cursor = inputBuffer.length;
              } else {
                state.historyIndex = state.history.length;
                inputBuffer = '';
                state.input = '';
                state.cursor = 0;
              }
            } else if (next2 === 67) { // Right arrow
              state.cursor = Math.min(state.cursor + 1, inputBuffer.length);
            } else if (next2 === 68) { // Left arrow
              state.cursor = Math.max(0, state.cursor - 1);
            }
          }
          renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
          return;
        }

        if (byte === 127 || byte === 8) { // Backspace
          if (state.cursor > 0) {
            inputBuffer = inputBuffer.slice(0, state.cursor - 1) + inputBuffer.slice(state.cursor);
            state.cursor--;
            state.input = inputBuffer;
          }
        } else if (byte >= 32 && byte <= 126) { // Printable characters
          inputBuffer = inputBuffer.slice(0, state.cursor) + String.fromCharCode(byte) + inputBuffer.slice(state.cursor);
          state.cursor++;
          state.input = inputBuffer;
        }

        renderScreen(state.mode, state.messages, state.input, state.cursor, state.hasApiKey, state.statusMsg);
      }
    });
  }
}

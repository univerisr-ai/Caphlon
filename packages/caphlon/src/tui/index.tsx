/**
 * Caphlon TUI — Ink-based Terminal Interface
 *
 * Uses React + Ink for a modern, Claude Code-like TUI experience.
 */

import { render } from 'ink';
import { App } from './components/app.js';

export async function startTui(): Promise<void> {
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}


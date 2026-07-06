#!/usr/bin/env node

/**
 * Caphlon CLI — Unified entry point for the Caphlon AI Agent Platform.
 *
 * Komut yüzeyi tek yerde tanımlıdır (src/index.ts) — güncel liste: caphlon --help
 * Alias: caph (caph dev, caph run "..." vb.)
 */

import { run } from '../dist/index.js';

run().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

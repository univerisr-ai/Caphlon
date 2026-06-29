#!/usr/bin/env node

/**
 * Caphlon CLI — Unified entry point for the Caphlon AI Agent Platform.
 *
 * Commands:
 *   caphlon init          Initialize a new Caphlon project
 *   caphlon dev           Start the Caphlon agent + dashboard
 *   caphlon run <prompt>  Run a task via Qualixar OS
 *   caphlon design        Design pipeline (Open Design integration)
 *   caphlon compose       Compose mode (MiMo workflow)
 *   caphlon status        System status
 *   caphlon doctor        Diagnostics
 *   caphlon config        Configuration
 *   caphlon version       Version info
 *
 * Alias: caph (caph dev, caph run "..." etc.)
 */

import { run } from '../dist/index.js';

run().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

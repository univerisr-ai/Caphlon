/**
 * commands/init — proje iskeleti oluşturma testleri.
 *
 * process.cwd()'yi izole bir geçici dizine taşır (gerçek repoya dokunmaz).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initCommand } from './init.js';

const dir = mkdtempSync(join(tmpdir(), 'caphlon-init-test-'));
const originalCwd = process.cwd();
process.chdir(dir);

test('init — MEMORY.md ve .caphlon/config.json oluşturur', async () => {
  await initCommand({ name: 'demo-project' });
  assert.equal(existsSync(join(dir, 'MEMORY.md')), true);
  assert.equal(existsSync(join(dir, '.caphlon', 'config.json')), true);
  const cfg = JSON.parse(readFileSync(join(dir, '.caphlon', 'config.json'), 'utf8'));
  assert.equal(cfg.projectName, 'demo-project');
});

test('init — MEMORY.md zaten varsa üzerine yazmaz', async () => {
  const custom = '# Zaten var olan içerik — korunmalı\n';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'MEMORY.md'), custom);
  await initCommand({ name: 'demo-project' });
  assert.equal(readFileSync(join(dir, 'MEMORY.md'), 'utf8'), custom);
});

test('init — isim verilmezse varsayılan "caphlon-project" kullanır', async () => {
  rmSync(join(dir, '.caphlon'), { recursive: true, force: true });
  await initCommand({});
  const cfg = JSON.parse(readFileSync(join(dir, '.caphlon', 'config.json'), 'utf8'));
  assert.equal(cfg.projectName, 'caphlon-project');
});

test.after(() => {
  process.chdir(originalCwd);
  rmSync(dir, { recursive: true, force: true });
});

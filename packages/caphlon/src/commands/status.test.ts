/**
 * `caphlon status` render katmanı testleri (P2-5).
 *
 * İzolasyon: CAPHLON_HOME taze geçici dizine yönlendirilir; XDG_DATA_HOME da
 * yönlendirilir ki getCredential makinedeki gerçek OpenCode auth.json
 * dosyasına düşmesin (deterministik "anahtar yok" durumu).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const home = mkdtempSync(join(tmpdir(), 'caphlon-status-test-'));
process.env.CAPHLON_HOME = home;
process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), 'caphlon-status-xdg-'));

const { renderConnectionLines, renderSkillLines } = await import('./status.js');

test('bağlantı yokken connect yönlendirmesi gösterilir', () => {
  const out = renderConnectionLines().join('\n');
  assert.match(out, /Not connected/);
  assert.match(out, /caphlon connect/);
});

test('aktif model + judge gösterilir; anahtar değeri asla ekrana çıkmaz', () => {
  writeFileSync(
    join(home, 'config.json'),
    JSON.stringify({
      activeProvider: 'opencode', // needsKey:false → defaultKey "public"
      activeModel: 'big-pickle',
      judgeProvider: 'groq',
      judgeModel: 'llama-3.3-70b-versatile',
      providers: {},
    }),
  );
  const out = renderConnectionLines().join('\n');
  assert.match(out, /Active: {3}opencode \/ big-pickle/);
  assert.match(out, /API key: {2}✅ set/);
  assert.match(out, /Judge: {4}groq \/ llama-3\.3-70b-versatile/);
  // Zen defaultKey ("public") dahil hiçbir anahtar değeri yazdırılmaz.
  assert.doesNotMatch(out, /public/);
});

test('judge bağlı değilse aktif modele düşüldüğü söylenir', () => {
  writeFileSync(
    join(home, 'config.json'),
    JSON.stringify({
      activeProvider: 'groq', // needsKey:true, anahtar yok → missing uyarısı
      activeModel: 'llama-3.3-70b-versatile',
      providers: {},
    }),
  );
  const out = renderConnectionLines().join('\n');
  assert.match(out, /API key: {2}❌ missing \(caphlon connect groq\)/);
  assert.match(out, /Judge: {4}— active model/);
});

test('skill satırları sayım ve sync durumunu gösterir (taze kurulum)', () => {
  const out = renderSkillLines().join('\n');
  assert.match(out, /Skills: {3}0 installed \(0 learned\)/);
  assert.match(out, /no remote \(caphlon skill sync push <repo>\)/);
});

/**
 * `.env.example` ↔ gerçek tüketiciler tutarlılık denetimi (P2-5).
 *
 * Üç invariant:
 *  1. docker-compose.yml içindeki ${VAR} referansları .env.example içinde
 *     belgelidir — compose'a değişken ekleyen dokümanı da günceller.
 *  2. Kaynak kodun okuduğu CAPHLON_* değişkenleri .env.example içinde
 *     belgelidir — yeni bir Caphlon env değişkeni sessizce belgesiz kalamaz.
 *  3. .env.example içindeki her değişkenin gerçek bir tüketicisi vardır
 *     (compose ya da koddaki process.env okuması) — doküman eskiyemez.
 *  4. Sağlayıcı API anahtarları (providers.ts kataloğu) .env.example
 *     içine GİRMEZ — anahtarların tek yolu `caphlon connect` (şifreli store).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROVIDERS } from './config/providers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'packages', 'caphlon', 'src');

/** .env.example içinde belgelenen değişkenler (yorumlanmış `# VAR=` dahil). */
function documentedVars(): Set<string> {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
  return new Set(
    [...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]!),
  );
}

/** docker-compose.yml içindeki ${VAR} / ${VAR:-default} referansları. */
function composeRefs(): Set<string> {
  const text = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
  return new Set(
    [...text.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g)].map((m) => m[1]!),
  );
}

function walkTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walkTs(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}

/** Kaynak kodun (testler hariç) process.env üzerinden okuduğu değişkenler. */
function codeReads(): Set<string> {
  const vars = new Set<string>();
  for (const f of walkTs(SRC)) {
    const text = readFileSync(f, 'utf8');
    const re = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])/g;
    for (const m of text.matchAll(re)) vars.add((m[1] ?? m[2])!);
  }
  return vars;
}

test('docker-compose ${VAR} referansları .env.example içinde belgelidir', () => {
  const docs = documentedVars();
  const missing = [...composeRefs()].filter((v) => !docs.has(v));
  assert.deepEqual(missing, [], `.env.example dosyasına ekle: ${missing.join(', ')}`);
});

test('kodun okuduğu CAPHLON_* değişkenleri .env.example içinde belgelidir', () => {
  const docs = documentedVars();
  const missing = [...codeReads()].filter(
    (v) => v.startsWith('CAPHLON_') && !docs.has(v),
  );
  assert.deepEqual(missing, [], `.env.example dosyasına ekle: ${missing.join(', ')}`);
});

test('.env.example içindeki her değişkenin gerçek bir tüketicisi vardır', () => {
  const consumers = new Set([...composeRefs(), ...codeReads()]);
  const stale = [...documentedVars()].filter((v) => !consumers.has(v));
  assert.deepEqual(stale, [], `tüketicisi olmayan (eski?) değişken: ${stale.join(', ')}`);
});

test('sağlayıcı API anahtarları .env.example içine sızmaz — tek yol caphlon connect', () => {
  const docs = documentedVars();
  const leaked = PROVIDERS.map((p) => p.envVar).filter((v) => docs.has(v));
  assert.deepEqual(
    leaked,
    [],
    `anahtar env değişkeni .env.example içinde olmamalı (caphlon connect yönetir): ${leaked.join(', ')}`,
  );
});

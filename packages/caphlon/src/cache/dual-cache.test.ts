/**
 * DualCache testleri — egos mimarisinin Caphlon uyarlamasının invariantları:
 * kişisel/teknik ayrımı, sır kapısı, borrow→report döngüsü, düzeltme akışı,
 * est_tokens_saved dürüst sayacı.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DualCache,
  jaccard,
  similarity,
  tokenize,
  scanSecrets,
  estTokens,
  JACCARD_THRESHOLD,
} from './dual-cache.js';

function fresh(): DualCache {
  return new DualCache(mkdtempSync(join(tmpdir(), 'caphlon-cache-test-')));
}

test('ortam: node:sqlite mevcut (Node 22.13+/23.4+)', () => {
  assert.equal(DualCache.available(), true);
});

test('jaccard + eşik hive_cache.py ile uyumlu (0.72)', () => {
  assert.equal(JACCARD_THRESHOLD, 0.72);
  const a = tokenize('Node ABI hatası better-sqlite3 derlemesi');
  assert.equal(jaccard(a, a), 1);
  assert.equal(jaccard(a, tokenize('tamamen alakasız pasta tarifi')), 0);
});

test('parafraz sorgu (alt küme) containment ile isabet alır, kısa sorguda fren çalışır', () => {
  const c = fresh();
  c.record(
    'zsh dizi olmayan degisken for dongusunde bolunmuyor kelime bolme',
    'zsh kelime bolmez; dizi kullan: branches=(...) ve "${branches[@]}"',
    'technical',
  );
  // Daha kısa parafraz — ham Jaccard eşiğin altında kalırdı, containment yakalar.
  const hit = c.borrow('zsh degisken for dongusunde neden bolunmuyor');
  assert.ok(hit, 'parafraz isabet almalıydı');
  // Fren: <4 içerik kelimeli sorgularda containment devrede DEĞİL.
  const a = tokenize('zsh degisken');
  const b = tokenize('zsh dizi olmayan degisken for dongusunde bolunmuyor kelime bolme');
  assert.equal(similarity(a, b), jaccard(a, b));
  c.close();
});

test('borrow: benzer soru teknik havuzdan isabet alır, alakasız almaz', () => {
  const c = fresh();
  c.record(
    'better-sqlite3 Node 24 ABI derleme hatası nasıl çözülür',
    'Node 22 LTS kullan: brew install node@22; setup-cores otomatik bulur.',
    'technical',
  );
  const hit = c.borrow('better-sqlite3 Node 24 ABI derleme hatası çözümü nedir');
  assert.ok(hit, 'benzer soru isabet almalıydı');
  assert.match(hit!.output, /Node 22/);
  assert.equal(hit!.scope, 'technical');
  assert.ok(hit!.similarity >= JACCARD_THRESHOLD);
  assert.equal(c.borrow('en iyi kek tarifi hangisi'), null);
  c.close();
});

test('kişisel kayıt varsayılandır ve kişisel havuzdan da ödünç alınabilir (yerel)', () => {
  const c = fresh();
  c.record('benim özel proje notum xyzq belirteci', 'cevap: abc');
  const s = c.stats();
  assert.equal(s.personal, 1);
  assert.equal(s.technical, 0);
  const hit = c.borrow('benim özel proje notum xyzq belirteci');
  assert.equal(hit?.scope, 'personal');
  c.close();
});

test('sır kapısı: teknik kayıtta anahtar deseni REDDEDİLİR, kişiselde taranmaz', () => {
  const c = fresh();
  const secret = 'çözüm: ANTHROPIC_API_KEY=sk-ant-abc12345678 olarak ayarla';
  assert.throws(() => c.record('anahtar nasıl ayarlanır', secret, 'technical'), /sır kapısı/);
  // kişisel kayıt yereldir, paylaşılmaz — tarama yok
  const id = c.record('anahtar nasıl ayarlanır', secret, 'personal');
  assert.ok(id);
  c.close();
});

test('scanSecrets desen aileleri', () => {
  assert.ok(scanSecrets('token: ghp_abcdefghijklmnop123').length > 0);
  assert.ok(scanSecrets('-----BEGIN RSA PRIVATE KEY-----').length > 0);
  assert.equal(scanSecrets('sıradan bir metin, anahtar yok').length, 0);
});

test('report worked: güven ve est_tokens_saved artar (çıktı×2 muhafazakâr model)', () => {
  const c = fresh();
  const out = 'x'.repeat(400); // ~100 token
  const id = c.record('soru bir iki üç dört beş', out, 'technical');
  c.borrow('soru bir iki üç dört beş');
  const r = c.report(id, true);
  assert.equal(r.ok, true);
  const s = c.stats();
  assert.equal(s.worked, 1);
  assert.equal(s.borrows, 1);
  assert.equal(s.estTokensSaved, estTokens(out) * 2); // 3× üretim − 1× okuma
  c.close();
});

test('report failed + düzeltme: çıktı güncellenir, sonraki ödünç düzeltilmişi alır', () => {
  const c = fresh();
  const id = c.record('docker compose port çakışması nasıl çözülür', 'YANLIŞ cevap', 'technical');
  const r = c.report(id, false, 'DOĞRU cevap: HIVE_PORT env ile portu değiştir');
  assert.equal(r.ok, true);
  const hit = c.borrow('docker compose port çakışması nasıl çözülür');
  assert.match(hit!.output, /DOĞRU cevap/);
  assert.equal(c.stats().failed, 1);
  c.close();
});

test('düzeltmede de sır kapısı çalışır (teknik havuz)', () => {
  const c = fresh();
  const id = c.record('api çağrısı örneği', 'eski cevap', 'technical');
  const r = c.report(id, false, 'yeni cevap: Bearer abcdefghijklmnopqrstuvwx kullan');
  assert.equal(r.ok, false);
  assert.match(r.detail, /sır kapısı/);
  c.close();
});

test('bilinmeyen entry raporu düzgün hata döner', () => {
  const c = fresh();
  const r = c.report('yok-boyle-id', true);
  assert.equal(r.ok, false);
  assert.match(r.detail, /bulunamadı/);
  c.close();
});

/**
 * config/evolve — SkillEvolver saf mantığı (prompt kurma + yanıt ayrıştırma).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clipTrace,
  buildGeneratorPrompt,
  buildJudgePrompt,
  extractJson,
  parseCandidate,
  parseVerdict,
} from './evolve.js';

test('clipTrace — kısa trace olduğu gibi kalır, uzun trace SONdan tutulur', () => {
  assert.equal(clipTrace('kısa'), 'kısa');
  const long = 'A'.repeat(100) + 'SONUÇ';
  const clipped = clipTrace(long, 50);
  assert.ok(clipped.endsWith('SONUÇ'), 'sondaki içerik korunmalı');
  assert.ok(clipped.includes('kırpıldı'), 'kırpma işareti eklenmiş olmalı');
});

test('extractJson — düz JSON, çitli JSON ve etraf metni tolere eder', () => {
  assert.equal(extractJson('{"a": 1}'), '{"a": 1}');
  assert.equal(extractJson('```json\n{"a": 1}\n```'), '{"a": 1}');
  assert.equal(extractJson('Sonuç şu: {"a": {"b": 2}} tamam.'), '{"a": {"b": 2}}');
  assert.equal(extractJson('hiç json yok'), null);
});

test('extractJson — string içindeki süslü parantezlere kanmaz', () => {
  const text = '{"body": "kod: if (x) { return; } bitti", "n": 1}';
  assert.equal(extractJson(`önsöz ${text}`), text);
});

test('parseCandidate — geçerli aday', () => {
  const c = parseCandidate(
    '{"title": "Node ABI tuzağı", "description": "d", "when_to_use": "w", "body": "b"}',
  );
  assert.equal(c?.title, 'Node ABI tuzağı');
  assert.equal(c?.whenToUse, 'w');
  assert.equal(c?.body, 'b');
});

test('parseCandidate — "ders yok" sinyali ({"title": null}) null döner', () => {
  assert.equal(parseCandidate('{"title": null}'), null);
});

test('parseCandidate — body eksikse null (boş skill kaydedilmesin)', () => {
  assert.equal(parseCandidate('{"title": "x", "description": "d", "when_to_use": "w"}'), null);
  assert.equal(parseCandidate('{"title": "x", "body": "  "}'), null);
});

test('parseCandidate — bozuk JSON / JSON\'suz metin null döner', () => {
  assert.equal(parseCandidate('üzgünüm, yapamam'), null);
  assert.equal(parseCandidate('{"title": "x", "body": '), null);
});

test('parseCandidate — camelCase whenToUse anahtarını da kabul eder', () => {
  const c = parseCandidate('{"title": "x", "whenToUse": "w2", "body": "b"}');
  assert.equal(c?.whenToUse, 'w2');
});

test('parseVerdict — onay/ret + reason', () => {
  assert.deepEqual(parseVerdict('{"approve": true, "reason": "sağlam"}'), {
    approve: true,
    reason: 'sağlam',
  });
  assert.deepEqual(parseVerdict('Karar: {"approve": false, "reason": "uydurma"}'), {
    approve: false,
    reason: 'uydurma',
  });
});

test('parseVerdict — approve boolean değilse null (fail-closed sinyali)', () => {
  assert.equal(parseVerdict('{"approve": "yes", "reason": "r"}'), null);
  assert.equal(parseVerdict('karar veremedim'), null);
});

test('buildGeneratorPrompt / buildJudgePrompt — trace ve aday prompta gömülü', () => {
  const g = buildGeneratorPrompt('TRACE_ICERIK');
  assert.ok(g.user.includes('TRACE_ICERIK'));
  assert.ok(g.system.includes('JSON'));

  const j = buildJudgePrompt(
    { title: 'T', description: 'D', whenToUse: 'W', body: 'B' },
    'TRACE_ICERIK',
  );
  assert.ok(j.user.includes('TRACE_ICERIK'));
  assert.ok(j.user.includes('"title": "T"'));
  assert.ok(j.system.toLowerCase().includes('independent'));
});

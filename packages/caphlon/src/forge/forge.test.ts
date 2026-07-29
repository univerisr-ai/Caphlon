/**
 * Forge çekirdek testleri — kanıt kapısının saf mantığı.
 * (Aday üretimi gerçek Aider ister; burada karar mantığı kilitlenir.)
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { detectVerifyCommands, isVerifiable } from './verify.js';
import { gate, judgePrompt, parseJudgeChoice, passedEssentials, type CandidateEvidence } from './select.js';

const cand = (
  id: string,
  o: Partial<CandidateEvidence> & { essentialPass?: boolean; optionalFail?: number } = {},
): CandidateEvidence => ({
  id,
  changed: o.changed ?? true,
  diffSize: o.diffSize ?? 10,
  error: o.error,
  checks: o.checks ?? [
    { label: 'npm test', passed: o.essentialPass ?? true, essential: true },
    ...Array.from({ length: o.optionalFail ?? 0 }, (_, i) => ({
      label: `lint${i}`, passed: false, essential: false,
    })),
  ],
});

test('verify keşfi: npm scripts (typecheck/lint önce, test zorunlu)', () => {
  const cmds = detectVerifyCommands({
    packageJson: JSON.stringify({ scripts: { typecheck: 'tsc', lint: 'eslint', test: 'node --test', build: 'tsc' } }),
  });
  assert.deepEqual(cmds.map((c) => c.label), ['npm run typecheck', 'npm run lint', 'npm test']);
  assert.equal(cmds.find((c) => c.label === 'npm test')!.essential, true);
  assert.equal(cmds.find((c) => c.label === 'npm run typecheck')!.essential, false);
  assert.ok(isVerifiable(cmds));
});

test('verify keşfi: test yoksa build zorunlu olur; hiçbiri yoksa doğrulanamaz', () => {
  const onlyBuild = detectVerifyCommands({ packageJson: JSON.stringify({ scripts: { build: 'tsc' } }) });
  assert.equal(onlyBuild.find((c) => c.essential)!.label, 'npm run build');
  assert.equal(isVerifiable(detectVerifyCommands({ packageJson: '{}' })), false);
});

test('verify keşfi: python/rust/go/make', () => {
  assert.equal(detectVerifyCommands({ pyprojectToml: '[project]' })[0]!.label, 'pytest');
  assert.equal(detectVerifyCommands({ cargoToml: '[package]' })[0]!.label, 'cargo test');
  assert.equal(detectVerifyCommands({ goMod: 'module x' })[0]!.label, 'go test');
  // Makefile yalnız son çare
  assert.equal(detectVerifyCommands({ makefile: 'test:\n\tpytest' })[0]!.label, 'make test');
  assert.equal(
    detectVerifyCommands({ goMod: 'module x', makefile: 'test:\n\tpytest' }).length, 1,
  );
});

test('KANIT KAPISI: testi geçmeyen aday elenir — model görüşü kurtaramaz', () => {
  const v = gate([cand('c1', { essentialPass: false }), cand('c2', { essentialPass: true })]);
  assert.deepEqual(v.survivors.map((s) => s.id), ['c2']);
  assert.equal(v.eliminated[0]!.reason, 'failed-essential');
  assert.equal(v.needsJudge, false); // tek hayatta kalan → judge'a para harcama
  assert.equal(v.fallbackWinner!.id, 'c2');
});

test('KANIT KAPISI: değişiklik üretmeyen ve araç hatası alan adaylar elenir', () => {
  const v = gate([cand('c1', { changed: false }), cand('c2', { error: 'aider çöktü' }), cand('c3')]);
  assert.deepEqual(v.survivors.map((s) => s.id), ['c3']);
  assert.deepEqual(v.eliminated.map((e) => e.reason).sort(), ['no-change', 'tool-error']);
});

test('sıralama: az opsiyonel-hata → küçük diff (sadelik) → deterministik id', () => {
  const v = gate([
    cand('c1', { optionalFail: 1, diffSize: 5 }),
    cand('c2', { optionalFail: 0, diffSize: 40 }),
    cand('c3', { optionalFail: 0, diffSize: 12 }),
  ]);
  assert.deepEqual(v.survivors.map((s) => s.id), ['c3', 'c2', 'c1']);
  assert.equal(v.needsJudge, true);
  assert.equal(v.fallbackWinner!.id, 'c3'); // judge yoksa: temiz + sade
});

test('hiç aday geçemezse kazanan YOK (kanıtsız kod dayatılmaz)', () => {
  const v = gate([cand('c1', { essentialPass: false }), cand('c2', { changed: false })]);
  assert.equal(v.fallbackWinner, null);
  assert.equal(v.survivors.length, 0);
});

test('passedEssentials: opsiyonel hata zorunluyu düşürmez', () => {
  assert.equal(passedEssentials(cand('c', { optionalFail: 2 })), true);
});

test('judge promptu: yalnız KANITLANMIŞ adaylar + "hepsi çalışıyor" çerçevesi', () => {
  const survivors = [cand('c1'), cand('c2')];
  const p = judgePrompt('slugify düzelt', survivors, { c1: 'diff-1', c2: 'diff-2' });
  assert.match(p, /HEPSİ projenin gerçek testlerinden geçti/);
  assert.match(p, /çalışıp çalışmadığına karar vermek DEĞİL/);
  assert.match(p, /diff-1/);
  assert.match(p, /diff-2/);
});

test('judge cevabı ayrıştırma: id, "Aday 2", düz sayı; tanınmazsa null', () => {
  const s = [cand('c1'), cand('c2')];
  assert.equal(parseJudgeChoice('c2', s), 'c2');
  assert.equal(parseJudgeChoice('Kazanan: c1 çünkü daha sade', s), 'c1');
  assert.equal(parseJudgeChoice('Aday 2', s), 'c2');
  assert.equal(parseJudgeChoice('2', s), 'c2');
  assert.equal(parseJudgeChoice('bilmiyorum', s), null); // → çağıran fallback'e düşer
});

/**
 * compose.ts saf yardımcılarının testleri (P: kesinti dayanıklılığı görünürlüğü).
 * parseWorkflowJournal, MiMo'nun persistence.ts JournalEvent satırlarını okur;
 * mimoDataDir, MIMOCODE_HOME override'ını launcher'dan ÖNCE uygular.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { join } from 'node:path';

process.env.MIMOCODE_HOME = '/tmp/caphlon-test-mimo-home';
const { parseWorkflowJournal, mimoDataDir } = await import('./compose.js');

test('parseWorkflowJournal: agent sayar, son fazı döndürür', () => {
  const journal = [
    JSON.stringify({ t: 'phase', title: 'Brainstorm', pass: 0 }),
    JSON.stringify({ t: 'agent', key: 'a:0', result: { ok: 1 }, pass: 0 }),
    JSON.stringify({ t: 'log', msg: 'ilerliyor', pass: 0 }),
    JSON.stringify({ t: 'phase', title: 'Implement', pass: 0 }),
    JSON.stringify({ t: 'agent', key: 'b:0', result: 'x', pass: 0 }),
    JSON.stringify({ t: 'agent', key: 'c:0', result: null, pass: 0 }),
  ].join('\n');
  const info = parseWorkflowJournal('wf_test', journal);
  assert.equal(info.runId, 'wf_test');
  assert.equal(info.agents, 3);
  assert.equal(info.lastPhase, 'Implement');
});

test('parseWorkflowJournal: crash anındaki yarım satır ve boş satırlar atlanır', () => {
  const journal =
    JSON.stringify({ t: 'phase', title: 'Verify', pass: 0 }) +
    '\n\n' +
    JSON.stringify({ t: 'agent', key: 'a:0', result: 1, pass: 0 }) +
    '\n{"t":"agent","key":"yarim'; // SIGKILL ortasında kesilen satır
  const info = parseWorkflowJournal('wf_x', journal);
  assert.equal(info.agents, 1);
  assert.equal(info.lastPhase, 'Verify');
});

test('parseWorkflowJournal: boş journal — 0 agent, faz yok', () => {
  const info = parseWorkflowJournal('wf_bos', '');
  assert.deepEqual(info, { runId: 'wf_bos', agents: 0, lastPhase: null });
});

test('mimoDataDir: MIMOCODE_HOME set ise launcher sorgulamadan <home>/data döner', () => {
  // dev.ts bundled kipte MIMOCODE_HOME'u .dev-home yapar; env override her kipte
  // aynı eve bakmayı garantiler — start ile runs farklı ev okuyamaz.
  assert.equal(mimoDataDir(), join('/tmp/caphlon-test-mimo-home', 'data'));
});

/**
 * caphlon forge — kanıt-kapılı kod üretimi (Caphlon'un imza mimarisi).
 *
 * Diğer kod CLI'ları: modeli çağırır, çıkan kodu verir. Doğrulama ya modelin
 * kendi görüşüdür ya da kullanıcının sonradan test çalıştırmasıdır.
 *
 * Forge'da sıra tersine döner — "çalışıyor mu?" sorusu "iyi mi?" sorusundan
 * ÖNCE ve kanıtla cevaplanır:
 *
 *   1. HATIRLA  — çözüm cache'i + ilgili skill'ler (aynı problemi ikinci kez
 *                 sıfırdan çözmeyiz)
 *   2. ÜRET     — N aday, N izole git worktree'sinde, GERÇEK Aider ile
 *                 (adaylar birbirini bozamaz)
 *   3. KANITLA  — her adayda projenin KENDİ doğrulama komutları koşar
 *                 (npm test / pytest / cargo test …) — görüş değil, exit code
 *   4. ELE      — zorunlu kontrolü geçemeyen aday yarış dışı; hiçbir model
 *                 görüşü onu kurtaramaz
 *   5. SEÇ      — yalnız KANITLANMIŞ çalışan adaylar arasından bağımsız judge
 *                 modeli seçer (üretici kendi işini onaylayamaz)
 *   6. ÖĞREN    — kazanan çözüm cache'e yazılır; bir dahaki sefere ödünç alınır
 *
 *   caphlon forge "<görev>" [-n 3]
 */

import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { getActiveModel, getJudgeModel } from '../config/active.js';
import { llmComplete } from '../llm.js';
import { skillContextPaths } from '../config/skills.js';
import { DualCache } from '../cache/dual-cache.js';
import { detectVerifyCommands, isVerifiable } from '../forge/verify.js';
import {
  createWorktrees, removeWorktrees, evaluateCandidate, landWinner, readProjectFiles, repoReady,
} from '../forge/run.js';
import { gate, judgePrompt, parseJudgeChoice, type CandidateEvidence } from '../forge/select.js';
import { heading, kv, paint } from '../ui/theme.js';

export async function forgeCommand(task: string, opts: { candidates?: string } = {}): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }
  const repo = process.cwd();
  const ready = repoReady(repo);
  if (!ready.ok) {
    console.error(chalk.red(`✖ ${ready.detail}`));
    process.exitCode = 1;
    return;
  }

  const n = Math.min(5, Math.max(2, parseInt(opts.candidates ?? '3', 10) || 3));
  const cmds = detectVerifyCommands(readProjectFiles(repo));

  console.log('\n' + heading('Caphlon Forge — kanıt-kapılı kod') + '\n');
  console.log(kv('Görev', task));
  console.log(kv('Aday', `${n} (izole worktree)`));
  console.log(
    kv('Kanıt', cmds.length ? cmds.map((c) => c.label).join(' · ') : paint.yellow('doğrulama komutu bulunamadı')),
  );
  if (!isVerifiable(cmds)) {
    console.log(
      paint.yellow(
        '\n⚠ Bu projede zorunlu bir doğrulama komutu (test/build) yok — Forge’un\n' +
          '  kanıt kapısı çalışamaz. Kanıtsız seçim yapmak yerine duruyorum:\n' +
          '  bir test komutu ekleyip tekrar dene, ya da `caphlon code` kullan.\n',
      ),
    );
    process.exitCode = 1;
    return;
  }

  // 1. HATIRLA — havuzda benzer çözüm var mı, ilgili skill'ler neler.
  const cache = DualCache.available() ? new DualCache() : null;
  let recall = '';
  try {
    const hit = cache?.borrow(task);
    if (hit && !(hit.warnings ?? []).some((w) => w.blocking)) {
      recall = `\n\n## Havuzdan hatırlanan (benzer problem, doğrulanmış çözüm)\n${hit.output}`;
      console.log(kv('Hafıza', `havuz isabeti (%${(hit.similarity * 100).toFixed(0)}) göreve eklendi`));
    }
  } catch {
    /* cache yoksa akış devam eder */
  }
  const skills = skillContextPaths(task, 3);
  if (skills.length) console.log(kv('Skill', `${skills.length} ilgili skill enjekte edildi`));

  const stamp = Date.now().toString(36);
  const wts = createWorktrees(repo, n, stamp);
  if (wts.length < 2) {
    removeWorktrees(repo, wts);
    console.error(chalk.red('✖ İzole worktree kurulamadı (git worktree hatası).'));
    process.exitCode = 1;
    return;
  }

  const evidences: CandidateEvidence[] = [];
  const diffs: Record<string, string> = {};
  try {
    // 2-3. ÜRET + KANITLA
    console.log('');
    for (const wt of wts) {
      process.stdout.write(paint.dim(`   ${wt.id}: üretiliyor…`));
      const { evidence, diff } = evaluateCandidate(wt, task + recall, active, skills, cmds);
      evidences.push(evidence);
      diffs[wt.id] = diff;
      const mark = evidence.error
        ? paint.red('araç hatası')
        : !evidence.changed
          ? paint.yellow('değişiklik yok')
          : evidence.checks.every((c) => c.passed)
            ? paint.green(`kanıtlandı (${evidence.diffSize} satır)`)
            : paint.red(`düştü: ${evidence.checks.filter((c) => !c.passed).map((c) => c.label).join(', ')}`);
      console.log(`\r   ${wt.id}: ${mark}          `);
    }

    // 4. ELE
    const verdict = gate(evidences);
    console.log('');
    console.log(kv('Kanıt kapısı', `${verdict.survivors.length}/${evidences.length} aday testleri geçti`));
    for (const e of verdict.eliminated) {
      const why = e.reason === 'no-change' ? 'değişiklik üretmedi'
        : e.reason === 'tool-error' ? `araç hatası (${e.detail ?? ''})`
        : `zorunlu kontrol düştü (${e.detail ?? ''})`;
      console.log(paint.dim(`   ✗ ${e.id}: ${why}`));
    }
    if (!verdict.fallbackWinner) {
      console.log(
        paint.yellow(
          '\n⚠ Hiçbir aday projenin testlerini geçemedi. Kanıtsız kod dayatmıyorum —\n' +
            '  görevi daralt, testleri kontrol et ya da `caphlon code` ile elle sür.\n',
        ),
      );
      process.exitCode = 1;
      return;
    }

    // 5. SEÇ — yalnız kanıtlanmışlar arasından, bağımsız judge.
    let winner = verdict.fallbackWinner;
    if (verdict.needsJudge) {
      const judge = getJudgeModel();
      const judgeModel = judge ?? active;
      try {
        const reply = llmComplete(judgeModel, {
          system: 'Sen bir kod incelemecisisin. Yalnızca istenen kimliği yaz, açıklama yapma.',
          user: judgePrompt(task, verdict.survivors, diffs),
          maxTokens: 64,
        });
        const chosen = parseJudgeChoice(reply, verdict.survivors);
        if (chosen) winner = verdict.survivors.find((s) => s.id === chosen)!;
        console.log(
          kv('Judge', `${judge ? 'bağımsız' : paint.yellow('aynı model (bağımsız judge için: caphlon connect <sağlayıcı> --judge)')} → ${winner.id}`),
        );
      } catch (e) {
        console.log(kv('Judge', paint.yellow(`çağrı başarısız (${e instanceof Error ? e.message.slice(0, 60) : ''}) → deterministik seçim: ${winner.id}`)));
      }
    } else {
      console.log(kv('Judge', `gerek yok — tek aday kanıtlandı (${winner.id})`));
    }

    // 6. UYGULA + ÖĞREN
    const landed = landWinner(repo, diffs[winner.id] ?? '');
    console.log('');
    if (!landed.ok) {
      console.error(chalk.red(`✖ ${landed.detail}`));
      process.exitCode = 1;
      return;
    }
    console.log(paint.green(`✓ Kazanan ${winner.id} uygulandı — ${landed.detail}`));
    console.log(paint.dim('  Gözden geçir:  git diff   ·  geri al:  git checkout -- .'));

    if (cache) {
      try {
        cache.record(task, `Forge kanıtlı çözüm (${winner.diffSize} satır, ${cmds.map((c) => c.label).join('+')} geçti):\n${(diffs[winner.id] ?? '').slice(0, 4000)}`, 'personal');
        console.log(paint.dim('  Ders kişisel havuza yazıldı (paylaşmak için: cache_contribute).'));
      } catch {
        /* öğrenme başarısız olsa da iş bitti */
      }
    }
    console.log('');
  } finally {
    cache?.close();
    removeWorktrees(repo, wts);
  }
}

/**
 * caphlon max — Best-of-N + judge (MiMo "max" agent).
 *
 * Zayıf modeli güçlendirmenin en yüksek kaldıraçlı inference-time tekniği:
 * her adımda N paralel aday üretilir, bağımsız bir judge çağrısı en iyisini
 * seçer, yalnızca kazanan yürütülür. "Kendinden emin yanlış" cevapları eler.
 *
 * No-rewrite: bunu biz yazmayız — MiMo'nun gerçek max-mode'unu (max-mode.ts,
 * runMaxStep + JUDGE_SYSTEM) `--agent max` ile başlatırız. Tetiklenmesi için
 * config'de experimental.maxMode tanımlı olmalı → MIMOCODE_CONFIG_CONTENT env
 * ile inline geçiririz (dosyaya dokunmadan).
 *
 *   caphlon max "<görev>"        5 aday + judge ile çöz
 *   caphlon max -n 3 "<görev>"   Aday sayısını ayarla
 *   caphlon max                  Etkileşimli (max agent ile aç)
 */

import chalk from 'chalk';
import {
  getActiveModel,
  getJudgeModel,
  activeModelEnv,
  judgeModelEnv,
  opencodeModelString,
} from '../config/active.js';
import { spawnInherit, notFound } from '../external.js';
import { resolveMimoLauncher } from './compose.js';
import { buildSkillPreamble } from '../config/skills.js';

export async function maxCommand(task: string, opts: { candidates?: string } = {}): Promise<void> {
  const active = getActiveModel();
  if (!active) {
    console.error(chalk.red('✖ Aktif model yok. Önce bir model bağla:  caphlon connect'));
    process.exitCode = 1;
    return;
  }

  const launcher = resolveMimoLauncher();
  if (!launcher) {
    notFound('MiMo Code', [
      'npm install -g @mimo-ai/cli',
      'veya bundled sürüm için Bun kur (https://bun.sh) + MiMo-Code-main bağımlılıklarını yükle',
    ]);
    return;
  }

  const n = Math.max(2, parseInt(opts.candidates ?? '5', 10) || 5);
  const modelStr = opencodeModelString(active);

  // Kör doğrulama: judge modeli bağlıysa kazananı O seçer (bağımsız), yoksa
  // eski davranış (judge = aday modeli). caphlon connect <sağlayıcı> --judge.
  const judge = getJudgeModel();
  const judgeStr = judge ? opencodeModelString(judge) : null;

  // max-mode yalnızca experimental.maxMode tanımlıysa tetiklenir (prompt.ts:3167).
  const cfg = JSON.stringify({
    experimental: { maxMode: { candidates: n, ...(judgeStr ? { judgeModel: judgeStr } : {}) } },
  });

  // AKTİF skill enjeksiyonu (görev varsa): top-K tam SKILL.md'yi prompt'a göm.
  const { prompt, used } = task.trim() ? buildSkillPreamble(task.trim()) : { prompt: '', used: [] };

  // Görev verildiyse non-interaktif `run` (tek-atış + çıkış); yoksa etkileşimli TUI.
  const args = task.trim()
    ? [...launcher.baseArgs, 'run', prompt, '--model', modelStr, '--agent', 'max']
    : [...launcher.baseArgs, '--model', modelStr, '--agent', 'max', '--trust'];

  console.log(chalk.bold(`\n🏆 Caphlon Max — ${chalk.cyan(modelStr)}  (best-of-${n} + judge)`));
  console.log(chalk.gray('   Her adımda N aday üretilir, judge en iyisini seçer → sadece kazanan yürütülür'));
  if (judgeStr) {
    console.log(chalk.green(`   ⚖️  Kör doğrulama: judge = ${chalk.bold(judgeStr)} (bağımsız model)`));
  } else {
    console.log(chalk.gray('   Judge = aday modeli. Bağımsız judge için: caphlon connect <sağlayıcı> --judge'));
  }
  if (used.length) console.log(chalk.green(`   🧩 ${used.length} skill aktif enjekte edildi: ${used.join(', ')}`));
  console.log(chalk.gray('   caphlon connect ile bağlı model kullanılıyor\n'));

  spawnInherit(
    launcher.cmd,
    args,
    { ...activeModelEnv(), ...judgeModelEnv(), MIMOCODE_CONFIG_CONTENT: cfg },
    launcher.cwd,
  );
}

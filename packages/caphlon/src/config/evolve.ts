/**
 * SkillEvolver — trace → aday skill → bağımsız judge → insan onayı (P1-2).
 *
 * Bu dosya akışın SAF mantığıdır (prompt kurma + yanıt ayrıştırma) — LLM
 * çağrısı yapmaz, dosya yazmaz. Komut katmanı (commands/skill.ts) bunları
 * llm.ts + recordLearning ile birleştirir. Öner-UYGULA değil, öner-ONAYLA:
 * son kapı her zaman insandır (--yes modunda judge kapıdır).
 */

export interface SkillCandidate {
  title: string;
  description: string;
  whenToUse: string;
  body: string;
}

export interface JudgeVerdict {
  approve: boolean;
  reason: string;
}

/** Trace'i modele sığacak boyuta indir — SON kısmı tut (sonuç/ders genelde sondadır). */
export function clipTrace(trace: string, maxChars = 24_000): string {
  if (trace.length <= maxChars) return trace;
  return `[...trace başı kırpıldı (${trace.length - maxChars} karakter)...]\n` + trace.slice(-maxChars);
}

export function buildGeneratorPrompt(trace: string): { system: string; user: string } {
  return {
    system: [
      'You are a skill distiller for an AI coding platform.',
      'From a work trace (session log, terminal output, diff, or notes) extract ONE',
      'reusable, non-obvious lesson worth teaching to a weaker model next time.',
      'Prefer concrete pitfalls and their fixes over generic advice.',
      'Reply with ONLY a JSON object (no markdown fences, no prose):',
      '{"title": "<short imperative title>",',
      ' "description": "<one-line summary>",',
      ' "when_to_use": "<trigger: when should this skill be recalled>",',
      ' "body": "<the lesson: symptom, root cause, correct approach; markdown allowed>"}',
      'If the trace contains NO reusable lesson, reply with exactly: {"title": null}',
    ].join('\n'),
    user: `Work trace:\n\n${trace}`,
  };
}

export function buildJudgePrompt(candidate: SkillCandidate, trace: string): { system: string; user: string } {
  return {
    system: [
      'You are an INDEPENDENT reviewer of a proposed skill for an AI coding platform.',
      'You did not write it. Verify against the trace:',
      '1. grounded: is the lesson actually supported by the trace (not invented)?',
      '2. reusable: will it help on FUTURE tasks, or is it one-off trivia?',
      '3. correct: is the advice technically sound?',
      'Reply with ONLY a JSON object (no fences, no prose):',
      '{"approve": true|false, "reason": "<one or two sentences>"}',
    ].join('\n'),
    user:
      `Proposed skill:\n${JSON.stringify(
        {
          title: candidate.title,
          description: candidate.description,
          when_to_use: candidate.whenToUse,
          body: candidate.body,
        },
        null,
        2,
      )}\n\nOriginal trace:\n\n${trace}`,
  };
}

/** Metinden ilk dengeli JSON objesini ayıkla (```json çitleri/etraf metni tolere edilir). */
export function extractJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Üretici yanıtını ayrıştır. `{"title": null}` (ders yok) → null; bozuk/eksik
 * alanlar → null. Çağıran null'u "aday üretilemedi" olarak ele alır.
 */
export function parseCandidate(text: string): SkillCandidate | null {
  const raw = extractJson(text);
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const title = obj.title;
  if (typeof title !== 'string' || !title.trim()) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const body = str(obj.body);
  if (!body) return null;
  return {
    title: title.trim(),
    description: str(obj.description),
    whenToUse: str(obj.when_to_use ?? (obj as Record<string, unknown>).whenToUse),
    body,
  };
}

/** Judge yanıtını ayrıştır. Ayrıştırılamıyorsa null — çağıran fail-closed davranır. */
export function parseVerdict(text: string): JudgeVerdict | null {
  const raw = extractJson(text);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.approve !== 'boolean') return null;
    return { approve: obj.approve, reason: typeof obj.reason === 'string' ? obj.reason : '' };
  } catch {
    return null;
  }
}

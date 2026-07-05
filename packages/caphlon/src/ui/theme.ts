/**
 * Caphlon — terminal görünüm katmanı (ratatui esintili, sıfır bağımlılık).
 *
 * Ratatui'nin Block::bordered().title() estetiği: başlık üst kenara gömülü
 * panel. Panel sağı bilinçli olarak açıktır — emoji/CJK karakterlerin
 * terminaldeki çift-hücre genişliği hizalamayı bozamaz (kapalı sağ kenar
 * genişlik hesabı ister, o hesap da taşınabilir değildir).
 *
 * Renkler NO_COLOR ortam değişkenine ve TTY olmayan çıkışa (pipe, CI, test)
 * saygı duyar: her ikisinde de düz metin üretilir.
 */

const WIDTH = 46;

function colorOn(): boolean {
  return !process.env.NO_COLOR && process.stdout.isTTY === true;
}

function wrap(code: number, s: string): string {
  return colorOn() ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const paint = {
  bold: (s: string) => wrap(1, s),
  dim: (s: string) => wrap(2, s),
  red: (s: string) => wrap(31, s),
  green: (s: string) => wrap(32, s),
  yellow: (s: string) => wrap(33, s),
  cyan: (s: string) => wrap(36, s),
};

/** Tek satırlık bölüm başlığı: `── Başlık ─────` */
export function heading(title: string): string {
  const pad = Math.max(1, WIDTH - title.length - 4);
  return `${paint.dim('── ')}${paint.bold(title)} ${paint.dim('─'.repeat(pad))}`;
}

/**
 * Sağı açık panel:
 *   ╭─ Başlık ─────────────────
 *   │ satır
 *   ╰──────────────────────────
 */
export function panel(title: string, lines: string[]): string {
  const pad = Math.max(1, WIDTH - title.length - 4);
  const top = `${paint.dim('╭─ ')}${paint.bold(title)} ${paint.dim('─'.repeat(pad))}`;
  const body = lines.map((l) => `${paint.dim('│')} ${l}`);
  const bottom = paint.dim(`╰${'─'.repeat(WIDTH - 1)}`);
  return [top, ...body, bottom].join('\n');
}

/** Hizalı etiket–değer satırı: etiket soluk, sabit genişlikte. */
export function kv(label: string, value: string): string {
  return `${paint.dim(label.padEnd(9))} ${value}`;
}

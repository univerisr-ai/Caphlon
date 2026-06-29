/**
 * caphlon tokenless — LLM token optimizasyonu (Rust). Model gerekmez.
 *
 * Sıfırdan yazmaz: gerçek `tokenless` binary'sini (PATH'te, derlenmiş hedefte
 * ya da dev-install konumunda) çalıştırır. tokenless'in "en iyi yanı" — şema/
 * yanıt sıkıştırma (%50–95 tasarruf), TOON kodlama, MCP sunucu modu — buradan
 * gelir. `tokenless init` Caphlon UI dahil kurulu ajanlara otomatik bağlanır.
 *
 *   caphlon tokenless init             Kurulu ajanlara otomatik bağla
 *   caphlon tokenless stats summary    Birikmiş token tasarrufu
 *   caphlon tokenless mcp-server       MCP sunucu (stdio) olarak çalıştır
 *   caphlon tokenless -- <ham args>    Bayrakları doğrudan tokenless'e geçir
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { firstExisting, onPath, spawnInherit, notFound, projectRoot } from '../external.js';

/** Gerçek tokenless binary'sini bul: PATH → derlenmiş hedef → dev-install. */
function resolveBinary(): string | null {
  if (onPath('tokenless')) return 'tokenless';
  return firstExisting(
    join(projectRoot(), 'core', 'tokenless-main', 'target', 'release', 'tokenless'),
    join(projectRoot(), 'tokenless-main', 'target', 'release', 'tokenless'),
    join(homedir(), '.tokenfleet-ai', 'bin', 'tokenless'),
    join(homedir(), '.local', 'bin', 'tokenless'),
  );
}

export async function tokenlessCommand(args: string[]): Promise<void> {
  const bin = resolveBinary();
  if (!bin) {
    notFound('tokenless', [
      'cargo install tokenless',
      'veya bundled sürüm: cd core/tokenless-main && make install',
    ]);
    return;
  }

  // Model gerektirmeyen bir araç katmanı; bağlı modele ihtiyaç yok.
  spawnInherit(bin, args);
}

/** caphlon doctor / status için: tokenless mevcut mu? */
export function tokenlessAvailable(): boolean {
  return resolveBinary() !== null;
}

/** Caphlon UI'ya MCP olarak bağlamak için binary yolu (yoksa null). */
export function tokenlessBinaryPath(): string | null {
  return resolveBinary();
}

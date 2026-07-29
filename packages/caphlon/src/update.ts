/**
 * Caphlon — güncelleme kontrolü (sor, sonra güncelle).
 *
 * Kullanıcı `caphlon` yazınca yeni sürüm varsa BİR KEZ sorulur; onay verirse
 * `npm i -g caphlon@latest` çalışır. Sessiz otomatik güncelleme YOK — kullanıcı
 * makinesinde ne çalıştığını bilmeli (projenin "sürpriz yok" ilkesi).
 *
 * Tasarım kararları:
 *  - Günde en fazla bir ağ isteği (kontrol damgası ~/.caphlon/update.json).
 *  - Ağ hatası/timeout tamamen sessiz — CLI asla kayıt defteri yüzünden yavaşlamaz.
 *  - TTY yoksa (script/CI/pipe) hiç sorulmaz.
 *  - CAPHLON_NO_UPDATE_CHECK=1 ile tamamen kapatılabilir.
 *  - Kaynak kurulumda (repo checkout) `npm i -g` yanlış olurdu → git talimatı verilir.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { caphlonHome } from './config/store.js';

const REGISTRY = 'https://registry.npmjs.org/caphlon/latest';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 saat
const TIMEOUT_MS = 2500;

interface UpdateState {
  lastCheck: number;
  /** Kullanıcının "sonra" dediği sürüm — aynı sürüm için tekrar sorulmaz. */
  dismissed?: string;
}

const statePath = () => join(caphlonHome(), 'update.json');

function loadState(): UpdateState {
  try {
    return { lastCheck: 0, ...JSON.parse(readFileSync(statePath(), 'utf8')) };
  } catch {
    return { lastCheck: 0 };
  }
}

function saveState(s: UpdateState): void {
  try {
    writeFileSync(statePath(), JSON.stringify(s), { mode: 0o600 });
  } catch {
    /* yazamıyorsak sessiz geç — güncelleme kontrolü kritik yol değil */
  }
}

/** "1.2.3" karşılaştırması (semver'in sayısal çekirdeği; ön-sürüm etiketleri yok sayılır). */
export function isNewer(remote: string, local: string): boolean {
  const parse = (v: string) => v.split('-')[0]!.split('.').map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parse(remote), parse(local)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

/** Global npm kurulumu mu, yoksa repo checkout'undan mı çalışıyoruz? */
export function isGlobalInstall(dirname: string): boolean {
  return dirname.includes('node_modules');
}

/** Kayıt defterinden en son sürüm (hata/timeout → null, asla fırlatmaz). */
async function fetchLatest(): Promise<string | null> {
  try {
    const res = await fetch(REGISTRY, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const j = (await res.json()) as { version?: string };
    return j.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Güncelleme var mı? (kota + kapatma bayrakları uygulanır)
 * Dönen değer: yeni sürüm ya da null.
 */
export async function checkForUpdate(current: string): Promise<string | null> {
  if (process.env.CAPHLON_NO_UPDATE_CHECK === '1') return null;
  const st = loadState();
  // Bozuk/ileri tarihli damga kontrolü süresiz kapatmasın — kendini onarır.
  if (st.lastCheck > Date.now()) st.lastCheck = 0;
  if (Date.now() - st.lastCheck < CHECK_INTERVAL_MS) return null;

  const latest = await fetchLatest();
  saveState({ ...st, lastCheck: Date.now() });
  if (!latest || !isNewer(latest, current)) return null;
  if (st.dismissed === latest) return null; // bu sürüm için "sonra" denmişti
  return latest;
}

/**
 * Açılış akışı: yeni sürüm varsa SOR, onay verilirse güncelle.
 * TTY yoksa hiç sorulmaz. Güncelleme sonrası kullanıcı komutu yeniden çalıştırır
 * (çalışan süreci canlı değiştirmek güvenilmez).
 */
export async function maybePromptUpdate(current: string, dirname: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  const latest = await checkForUpdate(current);
  if (!latest) return;

  console.log(`\n⬆️  Yeni Caphlon sürümü var: ${current} → ${latest}`);
  if (!isGlobalInstall(dirname)) {
    // Kaynaktan çalışıyor: npm -g yanlış hedefi güncellerdi.
    console.log('   Kaynak kurulumundasın — güncelleme: git pull && bash scripts/setup-cores.sh\n');
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question('   Şimdi güncellensin mi? [E/h] ')).trim().toLowerCase();
    if (ans && !['e', 'evet', 'y', 'yes', ''].includes(ans)) {
      saveState({ ...loadState(), dismissed: latest });
      console.log('   Atlandı — bu sürüm için tekrar sorulmayacak.\n');
      return;
    }
  } finally {
    rl.close();
  }

  console.log('   Güncelleniyor: npm install -g caphlon@latest …');
  const r = spawnSync('npm', ['install', '-g', 'caphlon@latest'], { stdio: 'inherit' });
  if (r.status === 0) {
    console.log(`\n✓ Caphlon ${latest} kuruldu. Komutu yeniden çalıştır.\n`);
    process.exit(0);
  }
  console.log('\n! Güncelleme başarısız — elle dene: npm install -g caphlon@latest\n');
}

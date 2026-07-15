/**
 * caphlon hive — Kovan Zekası (Hive Intelligence).
 *
 * "Binlerce zayıf düğüm → tek güçlü cevap", düşük tüketimle. Konsensüs +
 * paylaşımlı çözüm önbelleği + güvenlik (Validator/Reputation/Honeypot) +
 * federated LoRA besleme. Sıfırdan yazmaz: core/hive_*.py motorunu çalıştırır.
 *
 *   caphlon hive serve              Koordinatörü başlat (SuperLink)
 *   caphlon hive join --id n1       Düğüm olarak katıl, soruları cevapla
 *   caphlon hive ask "soru"         Kovana soru sor (konsensüs cevabı)
 *   caphlon hive train              Konsensüs çözümlerini LoRA verisine aktar
 *   caphlon hive stats              Kovan istatistikleri
 *   caphlon hive demo               "Çok düğüm → güç" simülasyonu (kanıt)
 */

import { join } from 'node:path';
import { activeModelEnv } from '../config/active.js';
import { findPython, firstExisting, spawnInherit, notFound, projectRoot } from '../external.js';

function coreDir(): string | null {
  return firstExisting(join(projectRoot(), 'core'), join(projectRoot(), '..', 'core'));
}

const SCRIPTS: Record<string, string> = {
  serve: 'hive_server.py',
  ask: 'hive_node.py',
  join: 'hive_node.py',
  pull: 'hive_node.py',
  'submit-delta': 'hive_node.py',
  solve: 'local_ensemble.py',
  train: 'trajectory_capture.py',
  demo: 'hive_demo.py',
};

/** hive_node.py'nin alt-komut bekleyen eylemleri. */
const NODE_SUBCOMMANDS = new Set(['ask', 'join', 'pull', 'submit-delta']);

export async function hiveCommand(sub: string | undefined, args: string[]): Promise<void> {
  const py = findPython();
  const core = coreDir();
  if (!py || !core) {
    notFound('Kovan motoru (Python + core/)', [
      'Python 3.9+ kurulu olmalı',
      'core/ dizini (hive_server.py, hive_node.py) proje kökünde olmalı',
    ]);
    return;
  }

  const action = sub ?? 'help';

  if (action === 'help' || action === '--help') {
    console.log(`caphlon hive — Kovan Zekası

  solve   "<soru>" [--samples 5]         Bağlı modeli N kez örnekle → konsensüs (tek makinede güç)
  serve   [--port 8777] [--quorum 3]     Koordinatörü başlat
  join    --id <ad> [--model-cmd "..."]  Düğüm olarak katıl
  ask     "<soru>" [--server URL]        Kovana sor (konsensüs)
  hub     [url|off]                      Çözüm-cache Merkez'ini ayarla/göster (cache_borrow Kovan'a düşer)
  train   [--min-score 1.5]              Konsensüs → LoRA eğitim verisi
  submit-delta --id <ad> --delta f.json  Lokal LoRA delta'sını gönder (federated)
  pull    [--out f.json]                 Güncel global adapter'ı indir
  stats   [--server URL]                 İstatistikler
  demo                                   Ölçek kanıtı (simülasyon)

Tipik akış (tek makinede dene):
  1) caphlon hive serve            # bir terminalde
  2) caphlon hive join --id n1     # başka terminallerde (n1, n2, n3...)
  3) caphlon hive ask "2+2 kactir?"`);
    return;
  }

  // hub: çözüm-cache Merkez'i (DualCache Faz 2) — koordinatör URL'ini bağla/göster.
  if (action === 'hub') {
    const { loadConfig, saveConfig } = await import('../config/store.js');
    const cfg = loadConfig();
    const val = args[0]?.trim();
    if (!val) {
      console.log(cfg.cacheHub ?? '(Merkez ayarlı değil — tamamen yerel mod)');
      return;
    }
    if (val === 'off') {
      saveConfig({ ...cfg, cacheHub: null });
      console.log('Çözüm-cache Merkez bağlantısı kapatıldı (yerel mod).');
      return;
    }
    saveConfig({ ...cfg, cacheHub: val });
    console.log(`Çözüm-cache Merkez'i ayarlandı: ${val}`);
    console.log('Artık cache_borrow yerel ıskada Kovan\'a sorar; cache_contribute Kovan\'a da gönderir.');
    return;
  }

  // stats: koordinatöre /stats GET — küçük python tek-satır (ek bağımlılık yok).
  if (action === 'stats') {
    const serverIdx = args.indexOf('--server');
    const server = serverIdx >= 0 ? args[serverIdx + 1] : 'http://127.0.0.1:8777';
    spawnInherit(py, ['-c',
      `import urllib.request,json;print(json.dumps(json.load(urllib.request.urlopen("${server}/stats")),indent=2,ensure_ascii=False))`,
    ]);
    return;
  }

  const script = SCRIPTS[action];
  if (!script) {
    console.error(`Bilinmeyen alt komut: ${action}. 'caphlon hive help' deneyin.`);
    process.exitCode = 1;
    return;
  }

  // hive_node.py alt komut bekler (ask/join/pull/submit-delta); diğerleri doğrudan.
  const scriptArgs = NODE_SUBCOMMANDS.has(action) ? [action, ...args] : args;

  // Bağlı modeli (caphlon connect) düğüme env ile geçir: --model-cmd verilmezse
  // düğüm UNDERDOG_LLM_* değişkenlerinden OpenAI-uyumlu çağrı yapar.
  const env = activeModelEnv();

  spawnInherit(py, [join(core, script), ...scriptArgs], env, core);
}

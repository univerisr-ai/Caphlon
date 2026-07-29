/**
 * Caphlon Forge — projenin KENDİ doğrulama komutunu keşfet.
 *
 * Forge'un tüm iddiası buna dayanır: aday kodu "model beğendi" diye değil,
 * "projenin gerçek testleri geçti" diye seçeriz. O yüzden hangi komutun
 * gerçeği söylediğini bilmemiz gerekir — ve bunu tahmin etmeyiz, dosyalardan
 * okuruz (package.json scripts, pyproject, Cargo.toml, go.mod, Makefile).
 *
 * Saf ve testlenebilir: dosya içeriklerini alır, komut listesi döndürür.
 */

export interface VerifyCommand {
  /** Çalıştırılacak komut (shell yok — argv dizisi) */
  argv: string[];
  /** Kullanıcıya gösterilecek etiket */
  label: string;
  /** Bu komut olmadan "doğrulandı" demek anlamsız mı? (test = evet) */
  essential: boolean;
}

export interface ProjectFiles {
  packageJson?: string;
  pyprojectToml?: string;
  cargoToml?: string;
  goMod?: string;
  makefile?: string;
}

/**
 * Doğrulama komutlarını keşfet. Sıra önemlidir: önce hızlı statik kontroller
 * (typecheck/build), sonra testler — bir aday typecheck'te düşerse testi
 * koşturmaya gerek yok (ucuz eleme).
 */
export function detectVerifyCommands(files: ProjectFiles): VerifyCommand[] {
  const out: VerifyCommand[] = [];

  if (files.packageJson) {
    let scripts: Record<string, string> = {};
    try {
      scripts = (JSON.parse(files.packageJson) as { scripts?: Record<string, string> }).scripts ?? {};
    } catch {
      scripts = {};
    }
    // typecheck/lint: ucuz ve erken eleyici
    for (const s of ['typecheck', 'lint']) {
      if (scripts[s]) out.push({ argv: ['npm', 'run', s], label: `npm run ${s}`, essential: false });
    }
    if (scripts.test) {
      out.push({ argv: ['npm', 'test'], label: 'npm test', essential: true });
    }
    if (!scripts.test && scripts.build) {
      // Test yoksa en azından derlenmeli — "çalışıyor" iddiasının asgarisi.
      out.push({ argv: ['npm', 'run', 'build'], label: 'npm run build', essential: true });
    }
  }

  if (files.pyprojectToml) {
    out.push({ argv: ['python3', '-m', 'pytest', '-q'], label: 'pytest', essential: true });
  }

  if (files.cargoToml) {
    out.push({ argv: ['cargo', 'test', '--quiet'], label: 'cargo test', essential: true });
  }

  if (files.goMod) {
    out.push({ argv: ['go', 'test', './...'], label: 'go test', essential: true });
  }

  // Makefile: yalnız hiçbir dil-özgü hedef bulunamadıysa (son çare).
  if (out.length === 0 && files.makefile && /^test:/m.test(files.makefile)) {
    out.push({ argv: ['make', 'test'], label: 'make test', essential: true });
  }

  return out;
}

/** Doğrulanabilirlik: en az bir "essential" komut var mı? */
export function isVerifiable(cmds: VerifyCommand[]): boolean {
  return cmds.some((c) => c.essential);
}

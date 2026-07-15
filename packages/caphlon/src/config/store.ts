/**
 * Caphlon — Config & Credential Store
 *
 * OpenCode-style local store for the active model selection plus
 * machine-bound, AES-256-GCM-encrypted API keys.
 *
 * Layout (override root with CAPHLON_HOME):
 *   ~/.caphlon/config.json        active provider/model + per-provider settings
 *   ~/.caphlon/credentials.enc    encrypted { providerId: apiKey } map
 *   ~/.caphlon/install.id         random UUID, part of the encryption key
 *
 * Design mirrors Qualixar OS' credential-manager: keys are never written in
 * plaintext and the derivation is bound to this machine (hostname + install id),
 * so a copied credentials.enc is useless on another host.
 */

import {
  randomBytes,
  randomUUID,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

const PBKDF2_ITERATIONS = 210_000; // OWASP 2026 (SHA-512)
const KEY_LENGTH = 32;

export interface ProviderSettings {
  /** Selected model id for this provider */
  model: string;
  /** Optional base URL override */
  baseUrl?: string;
}

export interface CaphlonConfig {
  /** Active provider id */
  activeProvider: string | null;
  /** Active model id (within the active provider) */
  activeModel: string | null;
  /**
   * Kör doğrulama (blind verification) için AYRI judge modeli: `caphlon max`
   * adayları aktif modelle üretir, kazananı BU model seçer — üretici kendi
   * işini onaylayamaz. Ayarlanmamışsa judge aktif modelle çalışır (eski davranış).
   */
  judgeProvider: string | null;
  /** Judge model id (judgeProvider içinde) */
  judgeModel: string | null;
  /** Per-provider settings */
  providers: Record<string, ProviderSettings>;
  /**
   * Çözüm-cache Merkez'i (Kovan koordinatörü URL'i, örn. http://127.0.0.1:8777).
   * null = tamamen yerel (varsayılan). Ayarlıysa cache_borrow yerel ıskada
   * Merkez'e sorar, cache_contribute Merkez'e de gönderir (sır kapılı).
   */
  cacheHub: string | null;
}

const DEFAULT_CONFIG: CaphlonConfig = {
  activeProvider: null,
  activeModel: null,
  judgeProvider: null,
  judgeModel: null,
  providers: {},
  cacheHub: null,
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function caphlonHome(): string {
  return process.env.CAPHLON_HOME || join(homedir(), '.caphlon');
}

function ensureHome(): string {
  const dir = caphlonHome();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

const configPath = () => join(caphlonHome(), 'config.json');
const credsPath = () => join(caphlonHome(), 'credentials.enc');
const installIdPath = () => join(caphlonHome(), 'install.id');

// ---------------------------------------------------------------------------
// Machine-bound key derivation
// ---------------------------------------------------------------------------

function getInstallId(): string {
  ensureHome();
  const p = installIdPath();
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  const id = randomUUID();
  writeFileSync(p, id, { mode: 0o600 });
  return id;
}

function deriveKey(salt: Buffer): Buffer {
  const secret = `${hostname()}::${getInstallId()}`;
  return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
}

// ---------------------------------------------------------------------------
// Config (plaintext, no secrets)
// ---------------------------------------------------------------------------

export function loadConfig(): CaphlonConfig {
  const p = configPath();
  if (!existsSync(p)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(p, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: CaphlonConfig): void {
  ensureHome();
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Credentials (encrypted)
// ---------------------------------------------------------------------------

type CredMap = Record<string, string>;

function readCreds(): CredMap {
  const p = credsPath();
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as {
      salt: string;
      iv: string;
      tag: string;
      data: string;
    };
    const key = deriveKey(Buffer.from(raw.salt, 'hex'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(raw.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(raw.tag, 'hex'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(raw.data, 'hex')),
      decipher.final(),
    ]);
    return JSON.parse(dec.toString('utf8')) as CredMap;
  } catch {
    // Wrong machine / corrupted / tampered → treat as empty
    return {};
  }
}

function writeCreds(creds: CredMap): void {
  ensureHome();
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(creds), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = {
    v: 1,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: enc.toString('hex'),
  };
  writeFileSync(credsPath(), JSON.stringify(payload), { mode: 0o600 });
  try {
    chmodSync(credsPath(), 0o600);
  } catch {
    /* best effort */
  }
}

export function setCredential(providerId: string, apiKey: string): void {
  const creds = readCreds();
  creds[providerId] = apiKey;
  writeCreds(creds);
}

/**
 * Fallback: OpenCode kendi API anahtarlarını ~/.local/share/opencode/auth.json
 * içinde ({ provider: { type, key } }) saklar. Caphlon'un makine-bağlı
 * credentials.enc'i çözülemezse (örn. install.id değişti) buradan oku — böylece
 * `caphlon hive` / orkestratör, TUI'nin kullandığı çalışan anahtarı bulur.
 */
function readOpencodeKey(providerId: string): string | null {
  const candidates = [
    process.env.XDG_DATA_HOME ? join(process.env.XDG_DATA_HOME, 'opencode', 'auth.json') : null,
    join(homedir(), '.local', 'share', 'opencode', 'auth.json'),
    join(homedir(), 'Library', 'Application Support', 'opencode', 'auth.json'),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const auth = JSON.parse(readFileSync(p, 'utf8')) as Record<string, { type?: string; key?: string }>;
      const entry = auth[providerId];
      if (entry?.key) return entry.key;
    } catch {
      /* sıradaki adaya geç */
    }
  }
  return null;
}

export function getCredential(providerId: string): string | null {
  return readCreds()[providerId] ?? readOpencodeKey(providerId) ?? null;
}

export function removeCredential(providerId: string): void {
  const creds = readCreds();
  delete creds[providerId];
  writeCreds(creds);
}

export function connectedProviders(): string[] {
  return Object.keys(readCreds());
}

/** Mask a key for display: sk-ant-…  → sk-ant-…3f9a */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

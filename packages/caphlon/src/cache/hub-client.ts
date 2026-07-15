/**
 * Caphlon — Çözüm-cache Merkez istemcisi (Kovan koordinatörü HTTP kapıları).
 *
 * Sıfır bağımlılık: yerleşik fetch (Node 22+). Merkez erişilemezse fonksiyonlar
 * fırlatmak yerine "unreachable" döner — cache katmanı YEREL çalışmaya devam
 * eder; Merkez bir hızlandırıcıdır, bağımlılık değildir.
 */

const TIMEOUT_MS = 4000;

export interface HubHit {
  id: number;
  instruction: string;
  output: string;
  similarity: number;
  score: number;
}

export type HubResult<T> =
  | { status: 'hit'; value: T }
  | { status: 'miss' }
  | { status: 'rejected'; detail: string } // 422 sır kapısı
  | { status: 'unreachable'; detail: string };

async function post(hub: string, path: string, body: unknown, token?: string | null): Promise<{ code: number; json: any } | null> {
  try {
    const res = await fetch(hub.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { code: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return null; // ağ/timeout — Merkez erişilemez
  }
}

export async function hubBorrow(hub: string, instruction: string, token?: string | null): Promise<HubResult<HubHit>> {
  const r = await post(hub, '/cache/borrow', { instruction }, token);
  if (!r) return { status: 'unreachable', detail: hub };
  if (r.code === 401) return { status: 'rejected', detail: 'Merkez kimlik istiyor — caphlon hive hub <url> --token <token>' };
  if (r.code === 404) return { status: 'miss' };
  if (r.code !== 200) return { status: 'unreachable', detail: `HTTP ${r.code}` };
  return { status: 'hit', value: r.json as HubHit };
}

export async function hubContribute(
  hub: string,
  instruction: string,
  output: string,
  nodeId?: string,
  token?: string | null,
): Promise<HubResult<{ id: number }>> {
  const r = await post(hub, '/cache/contribute', { instruction, output, node_id: nodeId }, token);
  if (!r) return { status: 'unreachable', detail: hub };
  if (r.code === 401) return { status: 'rejected', detail: 'Merkez kimlik istiyor — caphlon hive hub <url> --token <token>' };
  if (r.code === 422) return { status: 'rejected', detail: `sır kapısı (Merkez): ${(r.json.findings ?? []).join(', ')}` };
  if (r.code !== 200) return { status: 'unreachable', detail: `HTTP ${r.code}` };
  return { status: 'hit', value: { id: r.json.id as number } };
}

export async function hubReport(
  hub: string,
  id: number,
  worked: boolean,
  correction?: string,
  nodeId?: string,
  token?: string | null,
): Promise<HubResult<{ action: string }>> {
  const r = await post(hub, '/cache/report', { id, worked, correction, node_id: nodeId }, token);
  if (!r) return { status: 'unreachable', detail: hub };
  if (r.code === 401) return { status: 'rejected', detail: 'Merkez kimlik istiyor — caphlon hive hub <url> --token <token>' };
  if (r.code === 422) return { status: 'rejected', detail: `sır kapısı (Merkez): ${(r.json.findings ?? []).join(', ')}` };
  if (r.code === 404) return { status: 'miss' };
  if (r.code !== 200) return { status: 'unreachable', detail: `HTTP ${r.code}` };
  return { status: 'hit', value: { action: r.json.action as string } };
}

/** Merkez sağlık kontrolü (status paneli için). */
export async function hubReachable(hub: string): Promise<boolean> {
  try {
    const res = await fetch(hub.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Caphlon — Token-Tasarruf Cache MCP köprüsü (stdio, sıfır bağımlılık).
 *
 * Ajan bir teknik problemi çözmeye başlamadan ÖNCE cache_borrow çağırır;
 * isabet varsa çözümü okur (sıfırdan üretmek yerine) → isabet başına ~%80-90
 * token tasarrufu (egos simulate ile ölçülmüş model). Ödünç HER ZAMAN
 * cache_report ile kapatılır — çalışmayan bilgi düzeltmeyle temizlenir.
 *
 * Protokol şekli aider-mcp/egos-mcp aynası: satır-başına JSON-RPC 2.0,
 * stdout'ta yalnız MCP mesajı, tanılama stderr'e.
 */

import { createInterface } from 'node:readline';
import { DualCache } from '../cache/dual-cache.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Caphlon token-saving cache. BEFORE solving any technical problem (error ' +
  'message, config issue, tooling how-to): call cache_borrow with a concise, ' +
  'generalized problem statement. On a hit, apply the returned solution, ' +
  'verify it, then ALWAYS call cache_report (worked, or failed + your ' +
  'correction). On a miss, solve it yourself; if the solution is reusable ' +
  'and secret-free, share it with cache_contribute. Personal/project-private ' +
  'notes go to cache_remember (never shared).';

const TOOLS = [
  {
    name: 'cache_borrow',
    description:
      'ALWAYS call this FIRST before solving a technical problem yourself (error, config, tooling, how-to). ' +
      'Searches the local solution cache. On a hit you get the solution plus an entry_id — you MUST later call ' +
      'cache_report with that entry_id. A miss means: solve it yourself, then consider cache_contribute.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Concise, generalized problem statement' },
      },
      required: ['instruction'],
    },
  },
  {
    name: 'cache_report',
    description:
      'REQUIRED closing step for every cache_borrow hit. worked=true records the saving and raises trust. ' +
      'worked=false + correction (your own verified fix) repairs the entry so the pool stays clean. Never leave a borrow unreported.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: { type: 'string' },
        worked: { type: 'boolean' },
        correction: { type: 'string', description: 'Your working fix (only with worked=false)' },
      },
      required: ['entry_id', 'worked'],
    },
  },
  {
    name: 'cache_contribute',
    description:
      'Share a NEW verified, reusable, secret-free technical solution (after a cache_borrow miss). ' +
      'Content is secret-scanned; if rejected, mask the secrets and retry. Never include credentials, tokens or personal data.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Generalized problem statement' },
        output: { type: 'string', description: 'The verified solution' },
      },
      required: ['instruction', 'output'],
    },
  },
  {
    name: 'cache_remember',
    description:
      'Save a purely personal / project-private note (NEVER shared, not secret-scanned). Use for things that only matter to this user/machine.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: { type: 'string' },
        output: { type: 'string' },
      },
      required: ['instruction', 'output'],
    },
  },
];

interface McpResult {
  content: { type: 'text'; text: string }[];
  isError: boolean;
}

function textResult(text: string, isError = false): McpResult {
  return { content: [{ type: 'text', text }], isError };
}

let cache: DualCache | null = null;
function getCache(): DualCache {
  if (!cache) cache = new DualCache();
  return cache;
}

function callTool(name: string, args: Record<string, unknown>): McpResult {
  if (!DualCache.available()) {
    return textResult('cache devre dışı: node:sqlite yok (Node 22.13+/23.4+ gerekir)', true);
  }
  try {
    if (name === 'cache_borrow') {
      const hit = getCache().borrow(String(args.instruction ?? ''));
      if (!hit) return textResult('MISS — havuzda benzer çözüm yok. Kendin çöz; çözüm yeniden kullanılabilir ve sırsızsa cache_contribute ile paylaş.');
      return textResult(
        `HIT (benzerlik ${(hit.similarity * 100).toFixed(0)}%, güven +${hit.workedCount}/-${hit.failedCount})\n` +
          `entry_id: ${hit.entryId}\n\nÇÖZÜM:\n${hit.output}\n\n` +
          'Uygula ve doğrula; sonra MUTLAKA cache_report çağır (worked=true, ya da worked=false + correction).',
      );
    }
    if (name === 'cache_report') {
      const r = getCache().report(String(args.entry_id ?? ''), Boolean(args.worked), args.correction ? String(args.correction) : undefined);
      return textResult(r.detail, !r.ok);
    }
    if (name === 'cache_contribute') {
      const id = getCache().record(String(args.instruction ?? ''), String(args.output ?? ''), 'technical');
      return textResult(`kaydedildi (teknik havuz): ${id}`);
    }
    // cache_remember
    const id = getCache().record(String(args.instruction ?? ''), String(args.output ?? ''), 'personal');
    return textResult(`kaydedildi (kişisel, paylaşılmaz): ${id}`);
  } catch (e) {
    // Sır kapısı redleri dahil: isError metniyle dön ki model maskeleyip tekrar denesin.
    return textResult(`hata: ${e instanceof Error ? e.message : String(e)}`, true);
  }
}

type Json = Record<string, unknown>;

function result(id: unknown, res: unknown): Json {
  return { jsonrpc: '2.0', id, result: res };
}

function rpcError(id: unknown, code: number, message: string): Json {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/** Tek mesajı işle; bildirimler (id'siz) için null döner. */
export function handleMessage(msg: Json): Json | null {
  if (!('id' in msg)) return null;
  const id = msg.id;
  const method = msg.method as string | undefined;
  const params = (msg.params ?? {}) as Json;
  if (method === 'initialize') {
    const requested = params.protocolVersion as string | undefined;
    const version = requested && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return result(id, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: 'caphlon-cache', version: '0.1.0' },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params.name as string | undefined;
    if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, `bilinmeyen araç: ${name}`);
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
    for (const req of (TOOLS.find((t) => t.name === name)!.inputSchema as any).required as string[]) {
      if (toolArgs[req] === undefined || toolArgs[req] === null || toolArgs[req] === '') {
        return result(id, textResult(`hata: zorunlu argüman eksik: ${req}`, true));
      }
    }
    return result(id, callTool(name!, toolArgs));
  }
  return rpcError(id, -32601, `bilinmeyen metod: ${method}`);
}

function serve(): void {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: unknown;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      process.stdout.write(JSON.stringify(rpcError(null, -32700, 'parse error')) + '\n');
      return;
    }
    if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
      process.stdout.write(JSON.stringify(rpcError(null, -32600, 'istek bir JSON nesnesi olmalı')) + '\n');
      return;
    }
    try {
      const resp = handleMessage(msg as Json);
      if (resp) process.stdout.write(JSON.stringify(resp) + '\n');
    } catch (e) {
      process.stderr.write(`caphlon-cache-mcp beklenmeyen hata: ${String(e)}\n`);
      process.stdout.write(JSON.stringify(rpcError((msg as Json).id ?? null, -32603, 'internal error')) + '\n');
    }
  });
}

const isMain = process.argv[1]?.endsWith('cache-mcp.js') || process.argv[1]?.endsWith('cache-mcp.ts');
if (isMain) serve();

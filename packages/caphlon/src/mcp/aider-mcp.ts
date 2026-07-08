/**
 * Caphlon — Aider MCP köprüsü (stdio, sıfır bağımlılık).
 *
 * Amaç: kullanıcı `caphlon` yazıp AI ile konuşurken kapsamlı kod değişikliği
 * gerekince ajanın Aider'ı ARAÇ olarak kendiliğinden kullanabilmesi — komut
 * ezberi yok. No-rewrite: Aider'ı yeniden uygulamaz; gerçek aider'ı headless
 * (`--message`, `--yes-always`) çalıştırır, bağlı modeli `caphlon connect`
 * deposundan geçirir.
 *
 * Protokol: satır-başına-bir JSON-RPC 2.0 (newline-delimited MCP). Mesaj
 * işleme şekli, OpenCode ile kanıtlanmış çalışan egos MCP sunucusunu
 * (Project-egos-opt, egos/mcp.py) birebir aynalar. stdout'a MCP mesajı
 * dışında hiçbir şey yazılmaz; tanılama stderr'e.
 */

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolveAiderLauncher } from '../commands/code.js';
import { getActiveModel, aiderModelString } from '../config/active.js';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS =
  'Git-aware code editing via the real Aider. Use aider_edit when a change ' +
  'spans multiple files or needs repo-wide awareness; prefer your own edit ' +
  'tools for small single-file changes.';

const TOOLS = [
  {
    name: 'aider_edit',
    description:
      'Run the REAL Aider (git-aware AI pair-programmer) headlessly to implement a code change. ' +
      'USE WHEN: the change spans multiple files, needs repo-wide awareness (cross-module rename/refactor), ' +
      'or is a substantial implementation inside an existing git repository. Aider edits files IN PLACE and ' +
      'commits to git. Do NOT use for small single-file tweaks — your own edit tools are cheaper there. ' +
      'Always pass dir = the project root you are working in.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Imperative, specific instruction of what to implement/change' },
        files: { type: 'array', items: { type: 'string' }, description: 'Focus file paths (optional; aider maps the repo itself)' },
        dir: { type: 'string', description: 'Project root to run in (defaults to the server cwd)' },
        dry_run: { type: 'boolean', description: 'Only verify aider is runnable (prints version); no edits' },
      },
      required: ['task'],
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

function runAider(args: Record<string, unknown>): McpResult {
  const launcher = resolveAiderLauncher();
  if (!launcher) {
    return textResult('hata: aider kurulu değil → repo kökünde: bash scripts/setup-cores.sh', true);
  }
  if (args.dry_run) {
    const v = spawnSync(launcher.cmd, [...launcher.baseArgs, '--version'], {
      encoding: 'utf8',
      env: { ...process.env, ...launcher.env },
      timeout: 60_000,
    });
    return v.status === 0
      ? textResult(`aider hazır: ${(v.stdout ?? '').trim()}`)
      : textResult(`aider --version başarısız: ${(v.stderr ?? '').slice(-500)}`, true);
  }

  const active = getActiveModel();
  if (!active) return textResult('hata: bağlı model yok → caphlon connect', true);
  const env: NodeJS.ProcessEnv = { ...process.env, ...launcher.env };
  if (active.apiKey) env[active.provider.envVar] = active.apiKey;
  if (active.provider.id === 'ollama') env.OLLAMA_API_BASE = active.baseUrl;

  const files = Array.isArray(args.files) ? args.files.map(String) : [];
  const dir = typeof args.dir === 'string' && args.dir ? args.dir : process.cwd();
  const res = spawnSync(
    launcher.cmd,
    [
      ...launcher.baseArgs,
      '--model', aiderModelString(active),
      '--message', String(args.task),
      '--yes-always',
      '--no-stream',
      ...files,
    ],
    { cwd: dir, encoding: 'utf8', env, timeout: 600_000 },
  );
  const out = `${res.stdout ?? ''}\n${res.stderr ?? ''}`.trim();
  const tail = out.length > 4000 ? `…${out.slice(-4000)}` : out;
  if (res.error) return textResult(`aider başlatılamadı: ${res.error.message}`, true);
  if (res.status !== 0) return textResult(`aider hata (exit ${res.status}):\n${tail}`, true);
  return textResult(tail || 'aider tamamlandı (çıktı üretmedi)');
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
  if (!('id' in msg)) return null; // notifications/initialized vb.
  const id = msg.id;
  const method = msg.method as string | undefined;
  const params = (msg.params ?? {}) as Json;
  if (method === 'initialize') {
    const requested = params.protocolVersion as string | undefined;
    const version = requested && PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
    return result(id, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: { name: 'caphlon-aider', version: '0.1.0' },
      instructions: INSTRUCTIONS,
    });
  }
  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const name = params.name as string | undefined;
    if (name !== 'aider_edit') return rpcError(id, -32602, `bilinmeyen araç: ${name}`);
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;
    if (typeof toolArgs.task !== 'string' || !toolArgs.task.trim()) {
      return result(id, textResult('hata: zorunlu argüman eksik: task', true));
    }
    return result(id, runAider(toolArgs));
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
      // sunucu asla düşmesin; hatayı bildir
      process.stderr.write(`caphlon-aider-mcp beklenmeyen hata: ${String(e)}\n`);
      process.stdout.write(
        JSON.stringify(rpcError((msg as Json).id ?? null, -32603, 'internal error')) + '\n',
      );
    }
  });
}

// Test import'unda döngü başlamasın: yalnız doğrudan çalıştırılınca dinle.
const isMain = process.argv[1]?.endsWith('aider-mcp.js') || process.argv[1]?.endsWith('aider-mcp.ts');
if (isMain) serve();

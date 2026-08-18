import http from 'node:http';
import { SERVICE_NAME, PROXY_PORT, RUNNER_PORT } from '../config.js';
import { type RegisterRequest, type PingInfo, type ServersInfo, type ServerInfo } from '../types.js';
import { errMsg } from '../util.js';
import { PortTakenError, type Registry, UnknownServerError } from './registry.js';
import { type Proxy } from './proxy.js';

export interface ControlApiOptions {
  registry: Registry;
  proxy: Proxy;
  version: string;
  onShutdown: () => void;
  onCloseServer: (server: ServerInfo) => void;
}

/**
 * Localhost-only JSON API. Binding the control port exclusively is also what
 * enforces the global-singleton property of the runner.
 */
export function createControlApi(opts: ControlApiOptions): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    void handle(opts, req, res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port: RUNNER_PORT, host: '127.0.0.1', exclusive: true }, () => {
      resolve(server);
    });
  });
}

async function handle(opts: ControlApiOptions, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const { registry, proxy, version, onShutdown, onCloseServer } = opts;
  const send = (status: number, data: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  try {
    const body = req.method === 'POST' ? await readJson(req) : null;
    const route = `${req.method ?? ''} ${req.url ?? ''}`;
    switch (route) {
      case 'GET /api/ping': {
        const info: PingInfo = {
          ok: true,
          service: SERVICE_NAME,
          version,
          pid: process.pid,
          runnerPort: RUNNER_PORT,
          proxyPort: PROXY_PORT,
          proxyListening: proxy.listening,
          servers: registry.servers.size,
          activeId: registry.activeId,
        };
        send(200, info);
        return;
      }
      case 'GET /api/servers': {
        const info: ServersInfo = {
          servers: registry.list(),
          activeId: registry.activeId,
          proxyPort: PROXY_PORT,
          proxyListening: proxy.listening,
        };
        send(200, info);
        return;
      }
      case 'POST /api/register': {
        const parsed = parseRegisterRequest(body);
        if (!parsed) {
          send(400, { error: 'name, cwd, port, pid required' });
          return;
        }
        send(200, registry.register(parsed));
        return;
      }
      case 'POST /api/unregister': {
        send(200, { removed: registry.unregister(idOf(body)) });
        return;
      }
      case 'POST /api/activate': {
        registry.setActive(idOf(body));
        send(200, { activeId: registry.activeId });
        return;
      }
      case 'POST /api/rename': {
        const name = (body as { name?: unknown } | null)?.name;
        if (typeof name !== 'string' || name.trim() === '') {
          send(400, { error: 'non-empty name required' });
          return;
        }
        send(200, { ok: true, server: registry.rename(idOf(body), name.trim()) });
        return;
      }
      case 'POST /api/close': {
        const target = registry.servers.get(idOf(body));
        if (!target) {
          send(404, { error: `unknown server id ${idOf(body)}` });
          return;
        }
        onCloseServer(target);
        send(200, { ok: true });
        return;
      }
      case 'POST /api/shutdown': {
        send(200, { ok: true });
        setImmediate(onShutdown);
        return;
      }
      default:
        send(404, { error: 'not found' });
    }
  } catch (err) {
    if (err instanceof PortTakenError) {
      send(409, { error: err.message });
    } else if (err instanceof UnknownServerError) {
      send(404, { error: err.message });
    } else {
      send(500, { error: errMsg(err) });
    }
  }
}

function idOf(body: unknown): string {
  const id: unknown = (body as { id?: unknown } | null)?.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : '';
}

function parseRegisterRequest(body: unknown): RegisterRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const { name, cwd, port, pid } = body as Partial<Record<keyof RegisterRequest, unknown>>;
  if (typeof name !== 'string' || typeof cwd !== 'string') return null;
  if (typeof port !== 'number' || typeof pid !== 'number') return null;
  return { name, cwd, port, pid };
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as unknown) : null);
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RUNNER_PORT, SERVICE_NAME, STATE_DIR, LOG_FILE } from './config.js';
import { type PingInfo } from './types.js';
import { delay } from './util.js';

const BASE = `http://127.0.0.1:${String(RUNNER_PORT)}`;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(method: 'GET' | 'POST', apiPath: string, body?: unknown, timeoutMs = 2000): Promise<T> {
  const init: RequestInit = { method, signal: AbortSignal.timeout(timeoutMs) };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${apiPath}`, init);
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error ?? `runner API ${apiPath} failed (${String(res.status)})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/**
 * Returns runner info if a healthy runner answers on the control port, else null.
 * Throws if the port is occupied by something that is not our runner.
 */
export async function ping(): Promise<PingInfo | null> {
  let data: PingInfo;
  try {
    data = await api<PingInfo>('GET', '/api/ping', undefined, 1000);
  } catch (err) {
    if (err instanceof ApiError) throw portConflictError();
    return null;
  }
  if (data.service !== SERVICE_NAME) throw portConflictError();
  return data;
}

function portConflictError(): Error {
  return new Error(
    `Port ${String(RUNNER_PORT)} is in use by something that is not the ${SERVICE_NAME} runner.\n` +
      `Set RN_DEV_ROUTER_RUNNER_PORT to use a different control port.`,
  );
}

export function spawnRunnerDetached(): number | undefined {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const daemonPath = fileURLToPath(new URL('./runner/daemon.js', import.meta.url));
  const log = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: ['ignore', log, log],
    env: process.env,
  });
  child.unref();
  fs.closeSync(log);
  return child.pid;
}

/** Make sure a runner is alive; spawn one if needed. */
export async function ensureRunner(): Promise<{ info: PingInfo; spawned: boolean }> {
  const existing = await ping();
  if (existing) return { info: existing, spawned: false };

  spawnRunnerDetached();
  // If two clients race here, both spawn a daemon; the loser fails to bind the
  // control port and exits, so polling until ping succeeds is safe either way.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await delay(200);
    const info = await ping();
    if (info) return { info, spawned: true };
  }
  throw new Error(`Runner did not come up within 10s — check ${LOG_FILE}`);
}

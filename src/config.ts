import os from 'node:os';
import path from 'node:path';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Control API port of the global runner daemon (localhost only). */
export const RUNNER_PORT = intFromEnv('RN_DEV_ROUTER_RUNNER_PORT', 8790);

/** The well-known port RN tooling expects; the runner proxies it to the active server. */
export const PROXY_PORT = intFromEnv('RN_DEV_ROUTER_PROXY_PORT', 8081);

/** Metro instances get ports scanned from this range ("after 10000"). */
export const PORT_SCAN_START = 10001;
export const PORT_SCAN_END = 10999;

export const STATE_DIR = path.join(os.homedir(), '.react-native-dev-router');
export const LOG_FILE = path.join(STATE_DIR, 'runner.log');
export const RUNNER_INFO_FILE = path.join(STATE_DIR, 'runner.json');
export const STATE_FILE = path.join(STATE_DIR, 'state.json');

export const SERVICE_NAME = 'react-native-dev-router';

/** How often the start client re-registers (heartbeat; survives runner restarts). */
export const HEARTBEAT_MS = 4000;
/** How often the runner prunes servers whose client process died. */
export const SWEEP_MS = 2000;

// Global singleton runner daemon. Started detached by `react-native-dev-router
// start` or `... runner start`. Singleton-ness is enforced by the exclusive
// bind on the control port: a second daemon fails to bind and exits.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PROXY_PORT, RUNNER_PORT, RUNNER_INFO_FILE, STATE_DIR, SWEEP_MS, SERVICE_NAME } from '../config.js';
import { type ServerInfo, type UiState } from '../types.js';
import { errCode, errMsg } from '../util.js';
import { ping } from '../runner-client.js';
import { Registry } from './registry.js';
import { createProxy } from './proxy.js';
import { createControlApi } from './control-api.js';
import { createStatusBar, type StatusBar } from './statusbar.js';

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };

const log = (msg: string): void => {
  console.log(`[${new Date().toISOString()}] ${msg}`);
};

process.title = 'react-native-dev-router-runner';

const registry = new Registry();
const proxy = createProxy(PROXY_PORT, () => registry.active?.port ?? null, log);

let statusbar: StatusBar | null = null;
let shuttingDown = false;

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down (registered dev servers keep running)');
  try {
    fs.unlinkSync(RUNNER_INFO_FILE);
  } catch {
    // already gone
  }
  statusbar?.close();
  proxy.close();
  // Give the status item process a moment to exit cleanly.
  setTimeout(() => process.exit(code), 300);
}

function closeServer(server: ServerInfo): void {
  // The start client traps SIGTERM: kills its Metro child, unregisters, exits.
  log(`closing ${server.name} (pid ${String(server.pid)}, port ${String(server.port)})`);
  try {
    process.kill(server.pid, 'SIGTERM');
  } catch {
    registry.unregister(server.id);
  }
}

function uiState(): UiState {
  return {
    servers: registry.list(),
    activeId: registry.activeId,
    active: registry.active,
    proxyPort: PROXY_PORT,
    proxyListening: proxy.listening,
  };
}

let lastActivePort: number | null = null;
registry.on('change', () => {
  const active = registry.active;
  const activePort = active?.port ?? null;
  if (activePort !== lastActivePort) {
    // Drop live proxy connections so Metro clients reconnect to the new target.
    proxy.flush();
    log(`active server: ${active ? `${active.name} :${String(activePort ?? 0)}` : 'none'}`);
    lastActivePort = activePort;
  }
  statusbar?.update();
});

try {
  await createControlApi({
    registry,
    proxy,
    version,
    onShutdown: () => {
      shutdown(0);
    },
    onCloseServer: closeServer,
  });
} catch (err) {
  if (errCode(err) === 'EADDRINUSE') {
    const existing = await ping().catch(() => null);
    if (existing) {
      log(`runner already running (pid ${String(existing.pid)}), exiting`);
      process.exit(0);
    }
    log(`control port ${String(RUNNER_PORT)} is taken by another process — set RN_DEV_ROUTER_RUNNER_PORT`);
    process.exit(1);
  }
  throw err;
}

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(
  RUNNER_INFO_FILE,
  JSON.stringify(
    {
      pid: process.pid,
      runnerPort: RUNNER_PORT,
      proxyPort: PROXY_PORT,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);

log(
  `${SERVICE_NAME} runner v${version} up — control :${String(RUNNER_PORT)}, proxy :${String(PROXY_PORT)}, pid ${String(process.pid)}`,
);

statusbar = await createStatusBar({
  getState: uiState,
  onActivate: (id) => {
    try {
      registry.setActive(id);
    } catch (err) {
      log(errMsg(err));
    }
  },
  onClose: (id) => {
    const server = registry.servers.get(id);
    if (server) closeServer(server);
  },
  onShutdown: () => {
    shutdown(0);
  },
  log,
});
statusbar?.update();

setInterval(() => {
  registry.prune();
}, SWEEP_MS);

process.on('SIGTERM', () => {
  shutdown(0);
});
process.on('SIGINT', () => {
  shutdown(0);
});

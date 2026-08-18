import { spawn } from 'node:child_process';
import { PORT_SCAN_START, PORT_SCAN_END, PROXY_PORT, HEARTBEAT_MS } from './config.js';
import { type RegisterResult, type ServersInfo } from './types.js';
import { findFreePort, findReactNativeBin, projectName } from './util.js';
import { ensureRunner, api, ApiError } from './runner-client.js';

/**
 * `react-native-dev-router start [...args]`
 * Ensures the global runner is up, picks a free port after 10000, registers,
 * then runs the project-local `react-native start --port <port> [...args]`.
 */
export async function startCommand(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const rnBin = findReactNativeBin(cwd);
  if (rnBin === null) {
    console.error(
      'react-native-dev-router: no local react-native CLI found.\n' +
        `Run this inside a React Native project (looked for node_modules/.bin/react-native upward from ${cwd}).`,
    );
    process.exit(1);
  }

  const { userPort, sessionName, rest } = parseStartArgs(args);
  const name = sessionName ?? projectName(cwd);

  const { info, spawned } = await ensureRunner();
  console.log(
    spawned
      ? `[rn-dev-router] started global runner (pid ${String(info.pid)}, control :${String(info.runnerPort)}, proxy :${String(info.proxyPort)})`
      : `[rn-dev-router] joined global runner (pid ${String(info.pid)})`,
  );

  // Register before spawning Metro so the runner arbitrates port collisions
  // between concurrently starting projects (409 -> rescan and retry).
  let port = userPort;
  let registration: RegisterResult | null = null;
  for (let attempt = 0; attempt < 20 && registration === null; attempt++) {
    if (port === null) {
      const { servers } = await api<ServersInfo>('GET', '/api/servers');
      const taken = new Set(servers.map((s) => s.port));
      port = await findFreePort(PORT_SCAN_START, PORT_SCAN_END, taken);
    }
    try {
      registration = await api<RegisterResult>('POST', '/api/register', { name, cwd, port, pid: process.pid });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && userPort === null) {
        port = null; // taken meanwhile — rescan
      } else {
        throw err;
      }
    }
  }
  if (registration === null || port === null) {
    throw new Error('could not register a free port with the runner');
  }
  const metroPort = port;

  console.log(
    `[rn-dev-router] "${name}" on port ${String(metroPort)}` +
      (registration.active
        ? ` — active, proxied at :${String(PROXY_PORT)}`
        : ' — standby (switch via the ⚛ menu bar item)'),
  );

  const child = spawn(rnBin, ['start', '--port', String(metroPort), ...rest], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, RCT_METRO_PORT: String(metroPort) },
  });

  // Heartbeat: re-register periodically so a restarted runner re-learns us.
  const heartbeat = setInterval(() => {
    api('POST', '/api/register', { name, cwd, port: metroPort, pid: process.pid }).catch(() => {
      // runner down or port conflict — keep serving, retry next tick
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const registrationId = registration.id;
  let finishing = false;
  const finish = async (code: number): Promise<void> => {
    if (finishing) return;
    finishing = true;
    clearInterval(heartbeat);
    try {
      await api('POST', '/api/unregister', { id: registrationId });
    } catch {
      // runner already gone
    }
    process.exit(code);
  };

  child.on('exit', (code, signal) => {
    void finish(code ?? (signal === null ? 0 : 1));
  });

  // SIGINT reaches Metro too (same foreground process group) — just wait for
  // the child to exit. SIGTERM comes from the runner's "close" action.
  process.on('SIGINT', () => {
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
}

interface StartArgs {
  userPort: number | null;
  /** -n/--name: session display name override (menu bar + runner status). */
  sessionName: string | null;
  /** Everything else, passed through to `react-native start`. */
  rest: string[];
}

/**
 * Consume the options that belong to this tool (--port/-p to honor a
 * user-chosen port, -n/--name to label the session — useful when several
 * coding agents run sessions of the same project); pass the rest through.
 */
function parseStartArgs(args: string[]): StartArgs {
  const rest: string[] = [];
  let userPort: number | null = null;
  let sessionName: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) break;
    if (arg === '--port' || arg === '-p') {
      userPort = toPort(args[++i]);
    } else if (arg.startsWith('--port=')) {
      userPort = toPort(arg.slice('--port='.length));
    } else if (arg === '--name' || arg === '-n') {
      sessionName = toSessionName(args[++i]);
    } else if (arg.startsWith('--name=')) {
      sessionName = toSessionName(arg.slice('--name='.length));
    } else {
      rest.push(arg);
    }
  }
  return { userPort, sessionName, rest };
}

function toSessionName(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function toPort(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 || parsed > 65_535 ? null : parsed;
}

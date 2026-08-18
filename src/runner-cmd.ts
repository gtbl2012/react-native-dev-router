import { PROXY_PORT } from './config.js';
import { type ServersInfo } from './types.js';
import { api, ensureRunner, ping } from './runner-client.js';
import { delay } from './util.js';

/** `react-native-dev-router runner <start|stop|restart|status>` */
export async function runnerCommand(args: string[]): Promise<void> {
  const sub = args[0];
  switch (sub) {
    case 'start':
      await start();
      return;
    case 'stop':
      await stop();
      return;
    case 'restart':
      await stop();
      await start();
      return;
    case 'status':
    case undefined:
      await status();
      return;
    default:
      console.error(`Unknown runner subcommand: ${sub}\nUsage: react-native-dev-router runner <start|stop|restart|status>`);
      process.exit(1);
  }
}

async function start(): Promise<void> {
  const existing = await ping();
  if (existing) {
    console.log(`Runner already running (pid ${String(existing.pid)}, control :${String(existing.runnerPort)}, proxy :${String(existing.proxyPort)})`);
    return;
  }
  const { info } = await ensureRunner();
  console.log(`Runner started (pid ${String(info.pid)}, control :${String(info.runnerPort)}, proxy :${String(info.proxyPort)})`);
}

async function stop(): Promise<void> {
  const existing = await ping();
  if (!existing) {
    console.log('Runner is not running.');
    return;
  }
  await api('POST', '/api/shutdown');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await delay(150);
    if ((await ping().catch(() => null)) === null) {
      console.log(
        `Runner stopped.` +
          (existing.servers > 0
            ? ` ${String(existing.servers)} dev server(s) keep running and will re-register on the next runner start.`
            : ''),
      );
      return;
    }
  }
  throw new Error('Runner did not stop within 5s');
}

async function status(): Promise<void> {
  const info = await ping();
  if (!info) {
    console.log(`Runner is not running. Proxy :${String(PROXY_PORT)} is not managed.`);
    return;
  }
  const { servers, activeId } = await api<ServersInfo>('GET', '/api/servers');
  console.log(`Runner: pid ${String(info.pid)}, v${info.version}, control :${String(info.runnerPort)}`);
  console.log(
    `Proxy:  :${String(info.proxyPort)} ${info.proxyListening ? '(listening)' : '(port busy — is a plain Metro running?)'}`,
  );
  if (servers.length === 0) {
    console.log('No dev servers registered.');
    return;
  }
  console.log('');
  for (const server of servers) {
    const marker = server.id === activeId ? '●' : '○';
    console.log(
      `  ${marker} ${server.name.padEnd(24)} :${String(server.port)}  pid ${String(server.pid).padEnd(7)} ${server.cwd}`,
    );
  }
  console.log('\n  ● = active (routed to the proxy port)');
}

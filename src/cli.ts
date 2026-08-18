import { createRequire } from 'node:module';
import { startCommand } from './start.js';
import { runnerCommand } from './runner-cmd.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const HELP = `react-native-dev-router v${version}

Usage:
  react-native-dev-router start [...react-native start args]
      Start this project's Metro on a free port after 10000, register it with
      the global runner, and (if active) serve it through the :8081 proxy.
      All arguments are passed through to \`react-native start\`.

  react-native-dev-router runner <start|stop|restart|status>
      Control the global singleton runner daemon (proxy + menu bar indicator).

Environment:
  RN_DEV_ROUTER_RUNNER_PORT   control API port (default 8790)
  RN_DEV_ROUTER_PROXY_PORT    proxy port (default 8081)
`;

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'start':
      await startCommand(rest);
      return;
    case 'runner':
      await runnerCommand(rest);
      return;
    case '--version':
    case '-v':
      console.log(version);
      return;
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exit(1);
  }
}

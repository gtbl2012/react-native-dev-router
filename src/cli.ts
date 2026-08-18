import { createRequire } from 'node:module';
import { Command, InvalidArgumentError } from 'commander';
import { startCommand } from './start.js';
import { runnerStart, runnerStop, runnerRestart, runnerStatus, renameCommand } from './runner-cmd.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

interface StartCliOptions {
  port?: number;
  name?: string;
}

function parsePort(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new InvalidArgumentError('must be a port number (1-65535)');
  }
  return parsed;
}

// commander keeps a literal `--` among the collected passthrough args; drop the
// first one so `start -- --port 12345` hands react-native a parseable --port.
function stripPassthroughSeparator(args: string[]): string[] {
  const i = args.indexOf('--');
  return i === -1 ? args : [...args.slice(0, i), ...args.slice(i + 1)];
}

export async function main(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('react-native-dev-router')
    .description('Multi-instance React Native dev server router: one Metro per project on ports after 10000, the active one proxied to :8081, switchable from the ⚛ menu bar item.')
    .version(version, '-v, --version')
    .addHelpText(
      'after',
      '\nEnvironment:\n' +
        '  RN_DEV_ROUTER_RUNNER_PORT   control API port (default 8790)\n' +
        '  RN_DEV_ROUTER_PROXY_PORT    proxy port (default 8081)',
    );

  program
    .command('start')
    .description(
      "Start this project's Metro on a free port after 10000, register it with the global runner, and (if active) serve it through the proxy port.",
    )
    .option('-p, --port <port>', 'Metro port (skips free-port detection)', parsePort)
    .option(
      '-n, --name <name>',
      'session display name shown in the menu bar and `runner status` (default: package.json name)',
    )
    .argument('[reactNativeArgs...]', 'passed through to `react-native start` verbatim')
    .allowUnknownOption()
    .addHelpText(
      'after',
      '\nAll unrecognized arguments are passed through to `react-native start` in their original order. Use `--` to force everything after it through untouched.',
    )
    .action(async (reactNativeArgs: string[], opts: StartCliOptions): Promise<void> => {
      const name = opts.name?.trim();
      await startCommand({
        userPort: opts.port ?? null,
        sessionName: name === undefined || name === '' ? null : name,
        rest: stripPassthroughSeparator(reactNativeArgs),
      });
    });

  program
    .command('rename')
    .description('Rename a running dev server session (as shown in the menu bar and `runner status`).')
    .argument('<newName>', 'new session display name', (raw: string): string => {
      const trimmed = raw.trim();
      if (trimmed === '') throw new InvalidArgumentError('must not be empty');
      return trimmed;
    })
    .option('--id <id>', 'target session id (the start client pid, printed by `start`)')
    .option('--port <port>', 'target the session running on this Metro port', parsePort)
    .addHelpText(
      'after',
      '\nWithout --id/--port the session started from the current directory is renamed.',
    )
    .action(async (newName: string, opts: { id?: string; port?: number }): Promise<void> => {
      await renameCommand(newName, opts);
    });

  const runner = program
    .command('runner')
    .description('Control the global singleton runner daemon (proxy + menu bar indicator).');
  runner.command('start').description('start the runner daemon if it is not already running').action(runnerStart);
  runner
    .command('stop')
    .description('stop the runner daemon (registered dev servers keep running)')
    .action(runnerStop);
  runner.command('restart').description('restart the runner daemon').action(runnerRestart);
  runner
    .command('status', { isDefault: true })
    .description('show the runner and all registered dev servers')
    .action(runnerStatus);

  await program.parseAsync(argv, { from: 'user' });
}

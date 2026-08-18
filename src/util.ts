import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      resolve(false);
    });
    srv.listen({ port, host, exclusive: true }, () => {
      srv.close(() => {
        resolve(true);
      });
    });
  });
}

export async function findFreePort(start: number, end: number, exclude: ReadonlySet<number>): Promise<number> {
  for (let port = start; port <= end; port++) {
    if (exclude.has(port)) continue;
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free port found in range ${String(start)}-${String(end)}`);
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return errCode(err) === 'EPERM';
  }
}

/** Walk up from `cwd` looking for the project-local react-native CLI shim. */
export function findReactNativeBin(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const bin = path.join(dir, 'node_modules', '.bin', 'react-native');
    if (fs.existsSync(bin)) return bin;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Display name for a project: package.json name if present, else directory name. */
export function projectName(cwd: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as { name?: unknown };
    if (typeof pkg.name === 'string' && pkg.name.length > 0) return pkg.name;
  } catch {
    // no package.json at the project root — fall through
  }
  return path.basename(cwd);
}

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return stringifyUnknown(err) ?? 'unknown error';
  } catch {
    return 'unknown error'; // circular structure
  }
}

// JSON.stringify's lib types claim `string`, but it actually returns undefined
// for undefined/function/symbol input. The function boundary keeps the honest
// `string | undefined` type from being narrowed away.
function stringifyUnknown(value: unknown): string | undefined {
  return JSON.stringify(value);
}

export function errCode(err: unknown): string | undefined {
  if (err instanceof Error && 'code' in err) {
    const { code } = err as NodeJS.ErrnoException;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import net from 'node:net';
import { errCode, errMsg } from '../util.js';

export interface Proxy {
  readonly listening: boolean;
  /** Kill open connections so clients re-handshake against the new target. */
  flush(): void;
  close(): void;
}

/**
 * TCP-level proxy: pipes every connection on `port` to the active dev server.
 * Working at the TCP layer forwards HTTP and WebSocket (Metro's HMR/debugger
 * sockets) transparently. On target switch the daemon calls flush() so clients
 * reconnect to the new server.
 */
export function createProxy(port: number, getTargetPort: () => number | null, log: (msg: string) => void): Proxy {
  const sockets = new Set<net.Socket>();
  let listening = false;
  let retryTimer: NodeJS.Timeout | undefined;
  let closed = false;

  const server = net.createServer((client) => {
    const target = getTargetPort();
    if (target === null) {
      client.end(
        'HTTP/1.1 503 Service Unavailable\r\ncontent-type: text/plain\r\nconnection: close\r\n\r\n' +
          'react-native-dev-router: no active dev server registered\n',
      );
      return;
    }
    const upstream = net.connect(target, '127.0.0.1');
    sockets.add(client);
    sockets.add(upstream);
    const cleanup = (): void => {
      sockets.delete(client);
      sockets.delete(upstream);
      client.destroy();
      upstream.destroy();
    };
    client.on('error', cleanup);
    upstream.on('error', cleanup);
    client.on('close', cleanup);
    upstream.on('close', cleanup);
    client.pipe(upstream);
    upstream.pipe(client);
  });

  server.on('error', (err) => {
    if (errCode(err) === 'EADDRINUSE') {
      // Typically a plain `react-native start` already owns 8081. Keep retrying
      // so the proxy comes up as soon as that process goes away.
      log(`proxy: port ${String(port)} in use, retrying in 5s`);
      listening = false;
      retryTimer = setTimeout(() => {
        if (!closed) server.listen(port);
      }, 5000);
    } else {
      log(`proxy error: ${errMsg(err)}`);
    }
  });

  server.on('listening', () => {
    listening = true;
    log(`proxy: listening on :${String(port)}`);
  });

  server.listen(port);

  return {
    get listening(): boolean {
      return listening;
    },
    flush(): void {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    },
    close(): void {
      closed = true;
      clearTimeout(retryTimer);
      this.flush();
      server.close();
    },
  };
}

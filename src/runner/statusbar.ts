// macOS menu bar indicator built on glimpseui's statusItem (WKWebView popover).
// Degrades gracefully: if glimpseui or its native binary is unavailable (other
// platforms, skipped build), the runner keeps working headless.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  type GlimpseStatusItem,
  type statusItem as statusItemFn,
  type getNativeHostInfo as getNativeHostInfoFn,
} from 'glimpseui';
import { type UiState } from '../types.js';
import { errMsg } from '../util.js';

const POPOVER_WIDTH = 320;

export interface StatusBar {
  update(): void;
  close(): void;
}

export interface StatusBarOptions {
  getState: () => UiState;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onShutdown: () => void;
  log: (msg: string) => void;
}

type UiMessage = { action: 'shutdown' } | { action: 'activate' | 'close'; id: string };

function parseUiMessage(raw: unknown): UiMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { action, id } = raw as { action?: unknown; id?: unknown };
  if (action === 'shutdown') return { action };
  if ((action === 'activate' || action === 'close') && typeof id === 'string') return { action, id };
  return null;
}

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 8px;
    font: 13px -apple-system, "SF Pro Text", sans-serif;
    color: #1d1d1f; -webkit-user-select: none; cursor: default;
  }
  @media (prefers-color-scheme: dark) { body { color: #f5f5f7; } }
  .header { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 8px 8px; }
  .header .title { font-weight: 600; }
  .header .proxy { font-size: 11px; color: #8e8e93; font-variant-numeric: tabular-nums; }
  .row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; }
  .row:hover { background: rgba(125, 125, 125, 0.16); }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #98989d; flex: none; }
  .row.active .dot { background: #34c759; box-shadow: 0 0 6px rgba(52, 199, 89, 0.7); }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row.active .name { font-weight: 600; }
  .port { color: #8e8e93; font-variant-numeric: tabular-nums; flex: none; }
  .close {
    border: none; background: none; color: #8e8e93; font-size: 13px; line-height: 1;
    padding: 4px 6px; border-radius: 6px; cursor: pointer; flex: none;
  }
  .close:hover { background: rgba(255, 59, 48, 0.16); color: #ff3b30; }
  .empty { padding: 14px 8px; text-align: center; color: #8e8e93; }
  .footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 6px; padding: 8px 8px 2px; border-top: 1px solid rgba(125, 125, 125, 0.25);
    font-size: 11px; color: #8e8e93;
  }
  .quit {
    border: none; background: none; color: #8e8e93; font-size: 11px;
    padding: 3px 8px; border-radius: 6px; cursor: pointer;
  }
  .quit:hover { background: rgba(125, 125, 125, 0.16); }
</style></head>
<body>
  <div class="header"><span class="title">RN Dev Servers</span><span class="proxy" id="proxy"></span></div>
  <div id="list"></div>
  <div class="footer"><span>click a server to route it</span><button class="quit" onclick="glimpse.send({action:'shutdown'})">Quit runner</button></div>
  <script>
    window.__update = function (state) {
      const proxy = document.getElementById('proxy');
      proxy.textContent = state.proxyListening
        ? ':' + state.proxyPort + ' \\u2192 ' + (state.active ? ':' + state.active.port : '\\u2205')
        : ':' + state.proxyPort + ' busy';
      const list = document.getElementById('list');
      list.replaceChildren();
      if (!state.servers.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No dev servers running';
        list.appendChild(empty);
        return;
      }
      for (const server of state.servers) {
        const row = document.createElement('div');
        row.className = 'row' + (server.id === state.activeId ? ' active' : '');
        row.onclick = () => glimpse.send({ action: 'activate', id: server.id });
        const dot = document.createElement('span');
        dot.className = 'dot';
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = server.name;
        name.title = server.cwd;
        const port = document.createElement('span');
        port.className = 'port';
        port.textContent = ':' + server.port;
        const close = document.createElement('button');
        close.className = 'close';
        close.textContent = '\\u2715';
        close.title = 'Stop this dev server';
        close.onclick = (event) => {
          event.stopPropagation();
          glimpse.send({ action: 'close', id: server.id });
        };
        row.append(dot, name, port, close);
        list.appendChild(row);
      }
    };
  </script>
</body></html>`;

export async function createStatusBar(opts: StatusBarOptions): Promise<StatusBar | null> {
  const { getState, onActivate, onClose, onShutdown, log } = opts;

  let statusItem: typeof statusItemFn;
  let getNativeHostInfo: typeof getNativeHostInfoFn;
  try {
    ({ statusItem, getNativeHostInfo } = await import('glimpseui'));
  } catch (err) {
    log(`statusbar: glimpseui unavailable, running headless (${errMsg(err)})`);
    return null;
  }

  // glimpseui compiles its binary at install time (needs Xcode CLT); when that
  // was skipped, install the prebuilt universal binary bundled with this
  // package (built in CI) into the path glimpseui expects. The GLIMPSE_BINARY_PATH
  // env override is NOT usable here: statusItem() rejects platform 'override'.
  try {
    const envOverride = process.env['GLIMPSE_BINARY_PATH'] ?? process.env['GLIMPSE_HOST_PATH'];
    if (process.platform === 'darwin' && envOverride === undefined) {
      const hostPath = getNativeHostInfo().path;
      if (!fs.existsSync(hostPath)) {
        const bundled = fileURLToPath(new URL('../../native/glimpse', import.meta.url));
        if (fs.existsSync(bundled)) {
          fs.copyFileSync(bundled, hostPath);
          fs.chmodSync(hostPath, 0o755);
          log(`statusbar: local glimpse binary missing, installed bundled prebuilt to ${hostPath}`);
        }
      }
    }
  } catch (err) {
    log(`statusbar: could not install bundled glimpse binary (${errMsg(err)})`);
  }

  let item: GlimpseStatusItem | null = null;
  let closing = false;
  let retries = 0;

  const title = (state: UiState): string => {
    if (state.active) return `⚛ ${state.active.name.slice(0, 14)}`;
    return state.servers.length > 0 ? `⚛ ${String(state.servers.length)}` : '⚛ –';
  };

  const push = (): void => {
    if (!item) return;
    const state = getState();
    item.setTitle(title(state));
    item.resize(POPOVER_WIDTH, 96 + Math.max(1, state.servers.length) * 38);
    item.send(`window.__update && window.__update(${JSON.stringify(state)})`);
  };

  const spawnItem = (): void => {
    try {
      item = statusItem(PAGE, { title: '⚛ –', width: POPOVER_WIDTH, height: 140 });
    } catch (err) {
      log(`statusbar: failed to start (${errMsg(err)}), running headless`);
      item = null;
      return;
    }
    item.on('ready', push);
    item.on('click', push); // refresh right before the popover shows
    item.on('message', (data) => {
      const msg = parseUiMessage(data);
      if (!msg) return;
      switch (msg.action) {
        case 'activate':
          onActivate(msg.id);
          break;
        case 'close':
          onClose(msg.id);
          break;
        case 'shutdown':
          onShutdown();
          break;
      }
    });
    item.on('error', (err) => {
      log(`statusbar error: ${errMsg(err)}`);
    });
    item.on('closed', () => {
      item = null;
      if (closing) return;
      if (retries++ < 5) {
        log('statusbar: process exited, restarting in 3s');
        setTimeout(spawnItem, 3000);
      } else {
        log('statusbar: gave up restarting, running headless');
      }
    });
  };

  spawnItem();

  return {
    update: push,
    close(): void {
      closing = true;
      item?.close();
    },
  };
}

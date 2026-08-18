import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { STATE_FILE, STATE_DIR } from '../config.js';
import { type RegisterRequest, type RegisterResult, type ServerInfo } from '../types.js';
import { isPidAlive } from '../util.js';

export class PortTakenError extends Error {
  constructor(port: number, by: ServerInfo) {
    super(`Port ${String(port)} is already registered by ${by.name} (pid ${String(by.pid)})`);
    this.name = 'PortTakenError';
  }
}

/**
 * In-memory registry of dev servers, keyed by the start-client pid.
 * Emits 'change' whenever the server list or the active selection changes.
 */
export class Registry extends EventEmitter<{ change: [] }> {
  readonly servers = new Map<string, ServerInfo>();
  activeId: string | null = null;
  /**
   * The server key (cwd#port) the user last explicitly selected. Lets the
   * selection survive runner restarts: when that server re-registers it
   * becomes active again, even if another server registered first.
   */
  private preferredKey: string | null;

  constructor() {
    super();
    this.preferredKey = loadPreferredKey();
  }

  static key(server: Pick<ServerInfo, 'cwd' | 'port'>): string {
    return `${server.cwd}#${String(server.port)}`;
  }

  get active(): ServerInfo | null {
    return this.activeId === null ? null : (this.servers.get(this.activeId) ?? null);
  }

  list(): ServerInfo[] {
    return [...this.servers.values()].sort((a, b) => a.registeredAt - b.registeredAt);
  }

  /** Upsert by pid — the start client re-registers periodically as a heartbeat. */
  register(req: RegisterRequest): RegisterResult {
    const id = String(req.pid);
    for (const other of this.servers.values()) {
      if (other.id !== id && other.port === req.port && isPidAlive(other.pid)) {
        throw new PortTakenError(req.port, other);
      }
    }
    const existing = this.servers.get(id);
    const server: ServerInfo = {
      id,
      // A rename wins over whatever name the heartbeat keeps re-sending.
      name: existing?.customName ?? req.name,
      customName: existing?.customName ?? null,
      cwd: req.cwd,
      port: req.port,
      pid: req.pid,
      registeredAt: existing?.registeredAt ?? Date.now(),
    };
    this.servers.set(id, server);

    let changed =
      existing?.port !== server.port || existing.name !== server.name || existing.cwd !== server.cwd;
    if (this.activeId === null) {
      // First server up becomes active by default, without stealing preference.
      this.applyActive(id, { remember: false });
      changed = true;
    } else if (this.activeId !== id && Registry.key(server) === this.preferredKey) {
      // The user-preferred server came (back) up — it reclaims the route.
      this.applyActive(id, { remember: false });
      changed = true;
    }
    if (changed) this.emit('change');
    return { id, active: this.activeId === id };
  }

  unregister(id: string): boolean {
    if (!this.servers.delete(id)) return false;
    if (this.activeId === id) {
      this.activeId = null;
      const next = this.list()[0];
      if (next) this.applyActive(next.id, { remember: false });
    }
    this.emit('change');
    return true;
  }

  /** Explicit activation (menu bar click or API) — remembered across restarts. */
  setActive(id: string): void {
    if (!this.servers.has(id)) throw new UnknownServerError(id);
    if (this.activeId === id) return;
    this.applyActive(id, { remember: true });
    this.emit('change');
  }

  /** Rename a session; survives the client's heartbeat re-registration. */
  rename(id: string, name: string): ServerInfo {
    const server = this.servers.get(id);
    if (!server) throw new UnknownServerError(id);
    if (server.name !== name || server.customName !== name) {
      server.name = name;
      server.customName = name;
      this.emit('change');
    }
    return server;
  }

  /** Drop entries whose client process is gone. */
  prune(): void {
    for (const server of this.servers.values()) {
      if (!isPidAlive(server.pid)) this.unregister(server.id);
    }
  }

  private applyActive(id: string, opts: { remember: boolean }): void {
    this.activeId = id;
    if (opts.remember) {
      const server = this.servers.get(id);
      this.preferredKey = server ? Registry.key(server) : null;
      savePreferredKey(this.preferredKey);
    }
  }
}

export class UnknownServerError extends Error {
  constructor(id: string) {
    super(`Unknown server id ${id}`);
    this.name = 'UnknownServerError';
  }
}

function loadPreferredKey(): string | null {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as { activeKey?: unknown };
    return typeof raw.activeKey === 'string' ? raw.activeKey : null;
  } catch {
    return null;
  }
}

function savePreferredKey(key: string | null): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ activeKey: key }));
  } catch {
    // best effort — losing the preference is not fatal
  }
}

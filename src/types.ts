/** A registered dev server (one `react-native-dev-router start` client). */
export interface ServerInfo {
  /** Registry key — the start client's pid as a string. */
  id: string;
  /** Session display name (rename > -n/--name > package.json name > directory basename). */
  name: string;
  /**
   * Name set via the rename API, or null. Kept separately so the client's
   * heartbeat re-registration (which carries the original name) does not
   * clobber a rename.
   */
  customName: string | null;
  /** Project root the client was started from. */
  cwd: string;
  /** Port Metro is listening on. */
  port: number;
  /** Pid of the start client (not Metro itself). */
  pid: number;
  registeredAt: number;
}

export interface RegisterRequest {
  name: string;
  cwd: string;
  port: number;
  pid: number;
}

export interface RegisterResult {
  id: string;
  active: boolean;
}

export interface PingInfo {
  ok: boolean;
  service: string;
  version: string;
  pid: number;
  runnerPort: number;
  proxyPort: number;
  proxyListening: boolean;
  servers: number;
  activeId: string | null;
}

export interface ServersInfo {
  servers: ServerInfo[];
  activeId: string | null;
  proxyPort: number;
  proxyListening: boolean;
}

/** Snapshot pushed into the menu bar popover. */
export interface UiState {
  servers: ServerInfo[];
  activeId: string | null;
  active: ServerInfo | null;
  proxyPort: number;
  proxyListening: boolean;
}

# react-native-dev-router

[![npm version](https://img.shields.io/npm/v/react-native-dev-router)](https://www.npmjs.com/package/react-native-dev-router)
[![npm downloads](https://img.shields.io/npm/dm/react-native-dev-router)](https://www.npmjs.com/package/react-native-dev-router)
[![node](https://img.shields.io/node/v/react-native-dev-router)](https://www.npmjs.com/package/react-native-dev-router)
[![release](https://github.com/gtbl2012/react-native-dev-router/actions/workflows/release.yml/badge.svg)](https://github.com/gtbl2012/react-native-dev-router/actions/workflows/release.yml)
[![license](https://img.shields.io/npm/l/react-native-dev-router)](https://github.com/gtbl2012/react-native-dev-router/blob/main/LICENSE)
![platform](https://img.shields.io/badge/platform-macOS-black)

English | [简体中文](https://github.com/gtbl2012/react-native-dev-router/blob/main/README.zh-CN.md)

A Metro router for developing several React Native projects at the same time (macOS).

- **One Metro per project** on auto-assigned ports after 10000 — no more "port 8081 already in use".
- A **global singleton runner** daemon proxies the *active* server to **:8081**, so simulators and devices always connect to 8081 with zero per-project configuration.
- A **⚛ menu bar indicator** lists all running dev servers: click a row to route it to 8081, click ✕ to stop one.
- **Session naming** for coding agents: label each session at start (`-n`) or afterwards (`rename`), so several agents working on the same repo stay distinguishable.
- The server you switched to is **remembered** across runner and project restarts.

## Requirements

- macOS (the menu bar indicator is macOS-only; everything else degrades gracefully headless)
- Node.js ≥ 22.12

No Xcode required: a prebuilt universal (arm64 + x86_64) menu bar binary ships
with the package. If Xcode Command Line Tools are present, the
[glimpseui](https://github.com/hazat/glimpse) component is compiled locally at
install time and used instead.

## Install

### Per project (recommended)

```bash
npm install -D react-native-dev-router
```

```jsonc
// package.json
{
  "scripts": {
    "start": "react-native-dev-router start"
  }
}
```

```bash
npm start                         # auto port, registered, routed to :8081 if active
npm start -- -n fix-login-flow    # note the extra -- when passing flags through npm
```

### Global

```bash
npm install -g react-native-dev-router
cd your-rn-app && react-native-dev-router start
```

## Usage

```bash
react-native-dev-router start [options] [...react-native start args]
  # -p, --port <port>   pick a fixed Metro port (skips free-port detection)
  # -n, --name <name>   session display name (default: package.json name)
  # everything else is passed through to `react-native start` in order;
  # use `--` to force the rest through untouched

react-native-dev-router rename <name> [--id <pid> | --port <port>]
  # rename a running session; without --id/--port it targets the session
  # started from the current directory

react-native-dev-router runner [start|stop|restart|status]
  # control the global runner daemon; bare `runner` shows status
```

Typical multi-project session:

```bash
cd app-one && react-native-dev-router start          # :10001, active, proxied at :8081
cd ../app-two && react-native-dev-router start       # :10002, standby
# click ⚛ in the menu bar to switch which one your simulator talks to
```

Sessions started without a name print a copy-pasteable hint like
`react-native-dev-router rename <name> --id 12345`, so a coding agent can label
its own session after the fact. Stopping the runner never kills your dev
servers — they re-register automatically the next time the runner starts.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `RN_DEV_ROUTER_RUNNER_PORT` | 8790 | runner control API port (localhost only) |
| `RN_DEV_ROUTER_PROXY_PORT` | 8081 | proxy port |

Logs and state live in `~/.react-native-dev-router/` (`runner.log` is the place
to look when something is off).

## How it works

Each `start` invocation ensures the runner daemon is alive (spawning it detached
if needed), probes a free port in 10001–10999, pre-registers with the runner
(which arbitrates port collisions), then runs your project-local
`react-native start --port <port>` with logs inherited. The runner proxies
:8081 at the TCP level to the active server — WebSockets (HMR, inspector) pass
through transparently, and switching flushes existing connections so clients
reconnect to the new target. Clients re-register every few seconds, so the
registry rebuilds itself after a runner restart with no recovery logic.

## Development

```bash
npm install
npm run build       # tsc -> dist/
npm run check       # typecheck + lint
node dist/bin.js …  # run the CLI from source
```

Releases: bump the version on `main`, merge to the `release` branch, and push —
GitHub Actions publishes to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(with provenance), tags `v{version}`, and creates a GitHub Release.

## License

[MIT](https://github.com/gtbl2012/react-native-dev-router/blob/main/LICENSE)

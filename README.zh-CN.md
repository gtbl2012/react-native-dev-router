# react-native-dev-router

[![npm version](https://img.shields.io/npm/v/react-native-dev-router)](https://www.npmjs.com/package/react-native-dev-router)
[![npm downloads](https://img.shields.io/npm/dm/react-native-dev-router)](https://www.npmjs.com/package/react-native-dev-router)
[![node](https://img.shields.io/node/v/react-native-dev-router)](https://www.npmjs.com/package/react-native-dev-router)
[![release](https://github.com/gtbl2012/react-native-dev-router/actions/workflows/release.yml/badge.svg)](https://github.com/gtbl2012/react-native-dev-router/actions/workflows/release.yml)
[![license](https://img.shields.io/npm/l/react-native-dev-router)](https://github.com/gtbl2012/react-native-dev-router/blob/main/LICENSE)
![platform](https://img.shields.io/badge/platform-macOS-black)

[English](https://github.com/gtbl2012/react-native-dev-router/blob/main/README.md) | 简体中文

同时开发多个 React Native 项目时的 Metro 路由器（macOS）。

- **每个项目一个 Metro**，自动分配 10000 之后的端口 —— 告别「8081 被占用」。
- **全局单例 runner** 守护进程把「当前激活」的服务器代理到 **:8081**，模拟器 / 设备永远连 8081，任何项目都不用改配置。
- **菜单栏 ⚛ 指示器**列出所有在跑的 dev server：点击一行切换路由，点 ✕ 关闭对应服务器。
- **session 命名**，为 coding agent 设计：启动时 `-n` 或事后 `rename`，多个 agent 在同一个仓库里各起一个 session 也能一眼区分。
- 切换过的选择会被**记住**，runner 或项目重启后自动恢复。

## 环境要求

- macOS（菜单栏指示器仅 macOS；其余功能在无 UI 时自动降级）
- Node.js ≥ 22.12

无需安装 Xcode：包内自带预编译的 universal（arm64 + x86_64）菜单栏二进制。如果机器上有
Xcode Command Line Tools，安装时会现场编译 [glimpseui](https://github.com/hazat/glimpse)
组件并优先使用。

## 安装

### 项目内安装（推荐）

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
npm start                         # 自动分配端口、注册、激活时路由到 :8081
npm start -- -n fix-login-flow    # 通过 npm 传参要多加一个 --
```

### 全局安装

```bash
npm install -g react-native-dev-router
cd your-rn-app && react-native-dev-router start
```

## 使用

```bash
react-native-dev-router start [选项] [...react-native start 参数]
  # -p, --port <port>   指定 Metro 端口（跳过自动探测）
  # -n, --name <name>   session 显示名（默认取 package.json 的 name）
  # 其余参数按原顺序透传给 `react-native start`；
  # 用 `--` 可以强制其后的所有参数原样透传

react-native-dev-router rename <name> [--id <pid> | --port <port>]
  # 给运行中的 session 改名；不带 --id/--port 时定位当前目录启动的 session

react-native-dev-router runner [start|stop|restart|status]
  # 控制全局 runner 守护进程；不带子命令时显示 status
```

典型的多项目场景：

```bash
cd app-one && react-native-dev-router start          # :10001，激活，代理到 :8081
cd ../app-two && react-native-dev-router start       # :10002，待机
# 点菜单栏 ⚛ 切换模拟器连接的是哪一个
```

未命名启动的 session 会输出一条可直接复制的提示（形如
`react-native-dev-router rename <name> --id 12345`），coding agent 可以事后给
自己的 session 命名。`runner stop` 不会杀掉任何 dev server —— 下次 runner
启动时它们会自动重新注册。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `RN_DEV_ROUTER_RUNNER_PORT` | 8790 | runner 控制 API 端口（仅 localhost） |
| `RN_DEV_ROUTER_PROXY_PORT` | 8081 | 代理端口 |

日志与状态在 `~/.react-native-dev-router/`（排查问题先看 `runner.log`）。

## 工作原理

每次 `start`：确认 runner 守护进程存活（无则 detached 拉起）→ 在 10001–10999 探测
空闲端口 → 向 runner 预注册（端口冲突由 runner 仲裁）→ 用项目本地的
`react-native start --port <port>` 启动，日志直接可见。runner 在 TCP 层把 :8081
转发到激活的服务器 —— WebSocket（HMR / inspector）天然透传，切换时断开存量连接迫使
客户端向新目标重连。客户端每几秒重新注册一次，因此 runner 重启后注册表会自动重建，
无需任何恢复逻辑。

## 开发

```bash
npm install
npm run build       # tsc -> dist/
npm run check       # typecheck + lint
node dist/bin.js …  # 从源码运行 CLI
```

发版：在 `main` 上提版本号，merge 到 `release` 分支并 push —— GitHub Actions 会通过
[trusted publishing](https://docs.npmjs.com/trusted-publishers) 发布到 npm（带
provenance 溯源）、打 `v{version}` tag 并创建 GitHub Release。

## 许可证

[MIT](https://github.com/gtbl2012/react-native-dev-router/blob/main/LICENSE)

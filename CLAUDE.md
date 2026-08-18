# react-native-dev-router

macOS 上的多实例 React Native dev server 路由工具。让多个 RN 项目的 Metro 同时运行在
10001–10999 的端口上，由一个全局单例 runner 守护进程把「当前激活」的那个代理到 8081，
并通过 glimpseui 菜单栏指示器（⚛）切换 / 关闭。

## 命令

```bash
react-native-dev-router start [...args]   # 在 RN 项目内运行；args 全部透传给 react-native start
react-native-dev-router runner start|stop|restart|status
```

`start` 的行为：确认全局 runner 存活（无则 detached 拉起）→ 探测空闲端口 →
向 runner 预注册 → 用项目本地的 `node_modules/.bin/react-native start --port <port>` 启动
（stdio inherit，日志直接可见）。用户显式传 `--port` 时跳过探测。

`start` 自己消费两个选项（不透传）：`--port/-p`（指定端口）、`--name/-n`（session 显示名，
默认取项目 package.json 的 name；给 coding agent 区分同项目多 session 用）。其余参数
原样透传给 `react-native start`。

CLI 用 commander（`src/cli.ts`）。透传的实现要点：`start` 子命令开了
`.allowUnknownOption()` + 变长 `[reactNativeArgs...]`，未知 token（含「选项 值」对）
按原顺序落入 args；已知选项（`-n`/`-p`）在任意位置都会被摘出消费。**不要加
`.passThroughOptions()`**——那会让写在未知参数之后的 `-n` 被透传而不是被消费。
commander 会把字面 `--` 留在 args 里，`stripPassthroughSeparator()` 剥掉第一个，
所以 `start -- --port 12345` 能把 `--port` 真正交给 react-native。改动透传逻辑后
务必手测：`start --reset-cache -n x --max-workers 4 -- --sourceExts ts`。

## 开发命令

```bash
npm run build       # tsc -> dist/
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run check       # typecheck + lint，提交前必须通过
node dist/bin.js …  # 本地运行 CLI（改完记得先 build）
npm link            # 全局安装 bin
```

没有自动化测试；手动测试方法见下文。

## 架构

两类进程，通过 localhost HTTP 控制 API（默认 :8790）通信：

```
start 客户端 (每个项目一个)                 runner 守护进程 (全局单例)
┌─────────────────────────┐   register     ┌──────────────────────────────┐
│ src/start.ts            │  (=心跳,4s) →  │ src/runner/daemon.ts  入口    │
│  └─ spawn: react-native │                │  ├─ control-api.ts  :8790    │
│     start --port 1000x  │  ← SIGTERM     │  ├─ proxy.ts        :8081 ───┼─→ 转发到 active 的端口
└─────────────────────────┘   (close 时)   │  ├─ registry.ts     注册表    │
                                           │  └─ statusbar.ts    ⚛ 菜单栏 │
                                           └──────────────────────────────┘
```

- **单例机制**：daemon 对控制端口 exclusive bind；第二个 daemon 绑定失败后 ping 确认已有
  runner 存活就退出。没有锁文件。
- **control-api.ts**：仅监听 127.0.0.1。`GET /api/ping|servers`，
  `POST /api/register|unregister|activate|close|shutdown`。
- **proxy.ts**：TCP 层转发（`net` 直接 pipe），HTTP 和 WebSocket（Metro 的 HMR/inspector）
  天然透传。8081 被占（比如手动跑的 Metro）时每 5s 重试，占用者退出后自动接管。
- **registry.ts**：以 start 客户端 pid 为 key 的 upsert。`preferredKey`（`cwd#port`）持久化到
  `state.json`——用户显式切换过的服务器在 runner 重启 / 服务器重启后自动抢回 active。
- **statusbar.ts**：glimpseui `statusItem()`（仅 macOS）。popover 是一段内嵌 HTML，通过
  `item.send(js)` 推送状态、页面用 `glimpse.send({action,...})` 回传点击。glimpseui 不可用时
  headless 降级，runner 其余功能不受影响。

### 关键设计不变量（改代码前先读）

1. **注册即心跳**：客户端每 4s 重新 POST /api/register（按 pid upsert）。因此 runner
   重启后无需任何恢复逻辑，注册表几秒内自动重建。不要给 register 加副作用。
2. **先注册后启动 Metro**：端口冲突由 runner 仲裁（活着的条目占用同端口 → 409，客户端重扫）。
   两个项目并发 start 不会拿到同一个端口。
3. **close = 给客户端 pid 发 SIGTERM**：runner 不直接管 Metro 进程。客户端 trap SIGTERM →
   杀 Metro 子进程 → unregister → 退出。
4. **runner stop 不杀 dev server**：只停代理和 UI，客户端心跳失败静默重试，下次 runner
   起来自动重注册。
5. **切换 active 必须 `proxy.flush()`**：断掉存量 TCP 连接，客户端（app/HMR socket）才会
   向新目标重连。daemon.ts 的 `registry.on('change')` 里已处理。
6. **死进程清理**：runner 每 2s `process.kill(pid, 0)` 探活并剔除；active 死了自动顺位。

### 端口与文件约定

| 项 | 默认 | 覆盖方式 |
|---|---|---|
| 控制 API | 8790 | `RN_DEV_ROUTER_RUNNER_PORT` |
| 代理端口 | 8081 | `RN_DEV_ROUTER_PROXY_PORT` |
| Metro 端口范围 | 10001–10999 | `src/config.ts` 常量 |
| 状态目录 | `~/.react-native-dev-router/` | 含 `runner.json`（pid/端口）、`state.json`（active 偏好）、`runner.log`（daemon 全部输出，排查问题先看这里） |

环境变量只在进程启动时读取；改了 env 需要 `runner restart`（注意 restart 是新进程，
继承的是执行 restart 的 shell 的 env）。

## TypeScript / ESLint 约定

- 全量严格 tsconfig：`strict` + `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`、
  `verbatimModuleSyntax`、`noPropertyAccessFromIndexSignature` 等。NodeNext 模块解析 →
  **相对 import 必须写 `.js` 后缀**（源码是 .ts）。
- **`tsconfig.json` 里的 `"types": ["node"]` 不能删**：TS 6 不再自动加载 `@types/node`，
  删了会报几百个 `Cannot find name 'process'`。
- ESLint flat config（`eslint.config.mjs`）：`strictTypeChecked` + `stylisticTypeChecked` +
  显式返回类型 / switch 穷尽检查。`*.d.ts` 不 lint。
- glimpseui 不带类型 → 手写声明在 `src/glimpseui.d.ts`，只声明用到的 API。要用新 API
  （见 `node_modules/glimpseui/README.md`）先补声明。
- 错误处理用 `util.ts` 的 `errMsg()/errCode()` 收窄 unknown；跨进程错误用具名 Error 子类
  （`ApiError`、`PortTakenError`、`UnknownServerError`），control-api 靠 instanceof 映射状态码。

## 手动测试（无需真实 RN 项目）

伪造一个 RN 项目：`node_modules/.bin/react-native` 换成按 `--port` 起 HTTP 服务的
node 脚本（加 shebang + chmod +x，响应 SIGTERM/SIGINT 退出），配一个带 name 的
package.json。然后：

```bash
cd /tmp/fake-app && node <repo>/dist/bin.js start          # 应自动拉起 runner、分配 10001、active
curl http://127.0.0.1:8081/                                 # 应返回 fake server 的响应
curl -s http://127.0.0.1:8790/api/servers                   # id 即客户端 pid
curl -X POST http://127.0.0.1:8790/api/activate -H 'content-type: application/json' -d '{"id":"<pid>"}'
node dist/bin.js runner status && node dist/bin.js runner stop
```

测试代理时若本机 8081 已被占，用 `RN_DEV_ROUTER_PROXY_PORT=18081 node dist/bin.js runner start`。
测试会在菜单栏弹出 ⚛ 图标，结束记得 `runner stop`。

## 陷阱

- glimpseui 的 postinstall 用 `swiftc` 编译原生二进制，需要 Xcode Command Line Tools；
  编译失败不报错只警告，此时 statusbar 走 headless 降级路径。
  验证：`node -e "import('glimpseui').then(m=>console.log(m.getNativeHostInfo()))"`。
- `statusItem()` 仅 macOS，其他平台直接 throw（statusbar.ts 已 catch）。
- daemon 是 detached 后台进程，stdout/stderr 全在 `~/.react-native-dev-router/runner.log`，
  终端里看不到。
- 在本仓库根目录之外跑 `npm install <pkg>` 时注意：上层目录
  `~/Desktop/workspace/package.json` 存在，装错位置不会报错。

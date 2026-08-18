# react-native-dev-router

同时开发多个 React Native 项目时的 Metro 路由器（macOS）。

- `react-native-dev-router start`：把当前项目的 Metro 启动到 10000 之后的空闲端口，
  参数原样透传给 `react-native start`。
- 全局单例 **runner** 守护进程把「当前激活」的 Metro 代理到 **8081**——模拟器 / 设备
  永远连 8081，不用改任何项目配置。
- 菜单栏 **⚛** 指示器（基于 [glimpseui](https://github.com/hazat/glimpse)）显示所有
  在跑的 dev server：点击一行切换路由，点 ✕ 关闭那个 server。
- 切换过的选择会被记住，runner 或项目重启后自动恢复。

## 安装

```bash
npm install && npm run build
npm link        # 得到全局 react-native-dev-router 命令
```

需要 Xcode Command Line Tools（glimpseui 编译菜单栏原生组件用）。

## 使用

```bash
cd your-rn-app
react-native-dev-router start                 # 第一个项目：自动拉起 runner，分到 10001，路由到 8081
cd ../another-rn-app
react-native-dev-router start --reset-cache   # 第二个项目：分到 10002，待机；参数透传

react-native-dev-router runner status         # 查看 runner 和所有已注册 server
react-native-dev-router runner stop           # 停 runner（不影响已在跑的 Metro）
react-native-dev-router runner restart
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `RN_DEV_ROUTER_RUNNER_PORT` | 8790 | runner 控制 API 端口（仅 localhost） |
| `RN_DEV_ROUTER_PROXY_PORT` | 8081 | 代理端口 |

日志与状态在 `~/.react-native-dev-router/`。

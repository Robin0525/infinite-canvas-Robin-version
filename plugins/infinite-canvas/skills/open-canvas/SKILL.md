---
name: open-canvas
description: 打开 Infinite Canvas 在线或本地画布，并自动连接本地 Canvas Agent。用户要求打开、启动、进入或使用 Infinite Canvas 画布时使用。
---

# Open Infinite Canvas

默认使用已安装的 Windows 桌面版；不要打开上游在线站点。只有用户明确要求使用浏览器开发模式时，才启动本地前端。

## Windows 桌面版

1. 启动本地 Canvas Agent 并保持运行：

```bash
npx -y @basketikun/canvas-agent
```

2. 从启动输出取得 `Local URL` 和 `Connect token`。

3. 打开「无限画板」Windows 桌面版，在 Agent 面板输入 `Local URL` 和 `Connect token` 后连接。

## 本地版

1. 在 Infinite Canvas 项目中启动前端，并使用 Vite 输出的 `Local` 地址：

```bash
cd web
bun install
bun run dev
```

2. 启动本地 Canvas Agent：

```bash
npx -y @basketikun/canvas-agent
```

3. 从启动输出取得 `Local URL` 和 `Connect token`，在 Codex 右侧浏览器打开：

```text
<Vite Local 地址>/canvas?mode=new&agentUrl=<Local URL>&agentToken=<Connect token>
```

## MCP 与连接地址

插件在新的 Codex 任务中加载时会自动启动 `npx -y @basketikun/canvas-agent mcp`。这个 MCP 进程负责提供画布工具，不提供桌面应用连接服务；
因此还需要启动上面所示的普通 Canvas Agent，再把它输出的 `Local URL` 和 `Connect token` 填入桌面版 Agent 面板。两个进程读取同一份本地配置。

## 打开模式

用户没有明确指定打开方式时，始终使用 `mode=new` 新建画布。只有用户明确要求时才替换为：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`

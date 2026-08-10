---
name: open-canvas
description: 打开 Infinite Canvas 本地桌面画布，并自动连接 Robin Version 主仓库中的本地 Canvas Agent。
---

# Open Infinite Canvas

默认使用已安装的 Windows 桌面版，不打开上游在线站点。只有用户明确要求浏览器开发模式时，才启动本地前端。

## 主仓库

唯一主仓库为：

```text
D:\document\ChatGPT\无限画板开发\infinite-canvas-desktop-robin-version
```

不要使用同级旧目录 `infinite-canvas-desktop`。

## Windows 桌面版

1. 若本地 Agent 尚未构建，在主仓库的 `canvas-agent` 目录执行 `npm install` 与 `npm run build`。
2. 启动本地主仓库版本 Canvas Agent 并保持运行：

```powershell
node "D:\document\ChatGPT\无限画板开发\infinite-canvas-desktop-robin-version\canvas-agent\dist\index.js"
```

3. 从启动输出取得 `Local URL` 和 `Connect token`。
4. 打开 `C:\Users\33423\AppData\Local\无限画板\infinite-canvas-desktop.exe`，在 Agent 面板填入连接信息。

## 浏览器开发模式

在主仓库中启动前端，再启动同一个本地 Agent：

```powershell
cd "D:\document\ChatGPT\无限画板开发\infinite-canvas-desktop-robin-version\web"
npm run dev
```

使用 Vite 输出的本地地址，并按需附加：

```text
/canvas?mode=new&agentUrl=<Local URL>&agentToken=<Connect token>
```

## MCP 与连接地址

插件在新的 Codex 会话中直接运行主仓库构建产物 `canvas-agent/dist/index.js mcp`，以便应用功能与 Codex 工具保持同一版本。普通 Canvas Agent 服务和 MCP 进程读取同一份本地连接配置。

用户未指定打开方式时使用 `mode=new`。只有明确要求时改用：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`

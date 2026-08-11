---
name: open-canvas
description: 打开 Infinite Canvas Robin Version Windows 桌面画布，并自动连接 Robin Version 主仓库中的本地 Canvas Agent。
---

# Open Infinite Canvas

默认使用已安装的 Windows 桌面版，不打开上游在线站点。只有用户明确要求浏览器开发模式时，才启动本地前端。

## Windows 桌面版

1. 通过 Robin Version GitHub 主仓库启动最新版 Canvas Agent，并保持运行：

```powershell
npx -y github:Robin0525/infinite-canvas-Robin-version#main
```

2. 从启动输出取得 `Local URL` 和 `Connect token`。
3. 打开 `%LOCALAPPDATA%\无限画板\infinite-canvas-desktop.exe`，在 Agent 面板填入连接信息。

## 浏览器开发模式

克隆 Robin Version 主仓库后，在 `web` 目录启动前端，再启动同一个本地 Agent：

```powershell
git clone https://github.com/Robin0525/infinite-canvas-Robin-version.git
cd infinite-canvas-Robin-version\web
npm install
npm run dev
```

使用 Vite 输出的本地地址，并按需附加：

```text
/canvas?mode=new&agentUrl=<Local URL>&agentToken=<Connect token>
```

## MCP 与连接地址

插件在新的 Codex 会话中通过 `github:Robin0525/infinite-canvas-Robin-version#main` 运行 Canvas Agent MCP，以便应用功能与 Codex 工具保持同一版本。普通 Canvas Agent 服务和 MCP 进程读取同一份本地连接配置。

用户未指定打开方式时使用 `mode=new`。只有明确要求时改用：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`

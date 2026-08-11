# Infinite Canvas Codex Plugin

让 Codex 可以打开并操作 Infinite Canvas。

## 安装

macOS / Linux：

```bash
git clone https://github.com/Robin0525/infinite-canvas-Robin-version.git
cd infinite-canvas-Robin-version
codex plugin marketplace add "$(pwd)"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows PowerShell：

```powershell
git clone https://github.com/Robin0525/infinite-canvas-Robin-version.git
cd infinite-canvas-Robin-version
codex plugin marketplace add "$PWD"
codex plugin add infinite-canvas@infinite-canvas-local
```

Windows CMD 将 `$PWD` 替换为 `%cd%`。

插件的 MCP 会通过 Robin Version 主仓库启动最新版 Canvas Agent，不再依赖开发者电脑上的绝对路径。Windows 安装包同时携带一份插件市场快照，可在客户端“连接本地 Agent”页面查看对应安装命令。

安装后新建一个 Codex 任务，然后输入：

```text
帮我打开并连接到 Infinite Canvas
```

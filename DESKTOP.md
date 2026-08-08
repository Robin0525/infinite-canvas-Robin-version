# Windows 桌面版

本目录基于 `basketikun/infinite-canvas`，在原有 Vite + React 前端外增加 Tauri 桌面壳，不需要 Docker。

## 本地测试

```powershell
cd web
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。在右上角配置中填入兼容 OpenAI 的 Base URL 和 API Key 后，可测试图片和视频生成。

## Windows EXE

先安装 Rust stable（MSVC 工具链）和 WebView2 Runtime，然后执行：

```powershell
cd web
npm install
npm run desktop:build
```

构建产物为 NSIS 安装程序，位于 `web/src-tauri/target/release/bundle/nsis/`。

## 数据与密钥

画布、素材和 API 配置仍存于本机 WebView 的本地存储。请勿将公司共享 API Key 写入源码或安装包；后续接入企业网关后再改为服务端托管。

# 米醋画图

双面板图像工具：Base64 解码 + OpenAI 兼容 API 生图，支持 Electron 桌面应用与 NSIS 安装包发布。

## 功能

- **解码**：粘贴 Base64 或 Data URL，解析为图片预览、元数据展示、下载
- **生成**：调用 OpenAI 兼容接口（`/v1/images/generations`、`/v1/images/edits`、`/v1/chat/completions`）
- **多 API 配置**：支持新建/保存/切换多组接口配置，localStorage 持久化
- **模型列表获取**：一键拉取 provider 端 `/v1/models`，填充模型选择
- **N 并行请求**：设置 N 张数后自动拆分多次独立请求，合并结果
- **参考图片上传**：拖入/粘贴/点击上传（最多 9 张），支持 edits 模式
- **对话式工作台**：线程化展示用户 Prompt 与 AI 响应，支持重生成与复制
- **生图历史**：设置面板内置历史记录，支持查看、删除、清空
- **调试面板**：展示 API 请求原始响应与错误信息，便于排障
- **桌面托盘**：托盘右键支持打开主程序、显示历史记录、退出应用
- **内存优化**：关闭窗口时释放主渲染窗口，仅保留托盘常驻进程
- **响应式**：兼容桌面窗口尺寸变化

## 快速开始

### 安装依赖

```bash
npm install
```

### Electron 开发

```bash
npm run dev
```

### Electron 直接启动

```bash
npm start
```

### 构建桌面程序

```bash
npm run build
```

### 打包免安装版

```bash
npm run pack
```

输出目录：`release/win-unpacked/`

### 打包 NSIS 安装包

```bash
npm run dist
```

构建输出：`release/米醋画图 Setup X.X.X.exe`

## 项目结构

```text
MicuPaint_Next/
├── build/
│   └── icon.ico                # 主程序 / 安装包图标
├── dist/                       # 构建产物
├── release/                    # 打包产物
├── src/
│   ├── main/
│   │   └── main.ts             # Electron 主进程（窗口、托盘、IPC）
│   ├── preload/
│   │   └── preload.ts          # 安全桥接
│   └── renderer/
│       ├── index.html          # 渲染入口 HTML
│       ├── app.ts              # 前端逻辑
│       ├── styles.css          # 样式
│       └── global.d.ts         # 渲染端类型声明
├── package.json                # 项目脚本与 electron-builder 配置
├── package-lock.json
├── vite.config.ts              # 前端构建配置
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.base.json
├── tsconfig.main.json
├── tsconfig.preload.json
├── tsconfig.renderer.json
└── micu-image-20260607.html    # 原始单文件网页版本
```

## 技术栈

- TypeScript
- Vite
- Tailwind CSS + PostCSS
- Electron + electron-builder（NSIS 安装包）
- localStorage + IndexedDB

## 接口兼容

支持所有 OpenAI 兼容 API 端点：

| 模式 | 端点 | 说明 |
|------|------|------|
| images | `/v1/images/generations` | 文生图 |
| edits | `/v1/images/edits` | 图生图（支持多参考图） |
| chat | `/v1/chat/completions` | 对话生图 |

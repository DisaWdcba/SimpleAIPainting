# 米醋画图

双面板图像工具：Base64 解码 + OpenAI 兼容 API 生图，支持 Web 直接使用与 Electron 桌面打包。

## 功能

- **解码**：粘贴 Base64 或 Data URL，解析为图片预览、元数据展示、下载
- **生成**：调用 OpenAI 兼容接口（`/v1/images/generations`、`/v1/images/edits`、`/v1/chat/completions`）
- **多 API 配置**：支持新建/保存/切换多组接口配置，localStorage 持久化
- **模型列表获取**：一键拉取 provider 端 `/v1/models`，填充 datalist 下拉
- **N 并行请求**：设置 N 张数后自动拆分多次独立请求，合并结果
- **参考图片上传**：拖入/粘贴/点击上传（最多 9 张），支持 edits 模式
- **对话式工作台**：线程化展示用户 Prompt 与 AI 响应，版本切换、复制、重生成
- **内联编辑**：hover 用户气泡复制提示词或一键编辑后覆盖原对话
- **生图历史**：右侧抽屉历史记录，支持详情查看、单条删除、全部清空
- **调试面板**：手动开启，展示连通检测与每次 API 请求的原始响应
- **明暗主题**：跟随系统或手动切换，localStorage 记忆
- **响应式**：移动端侧栏覆盖式抽屉，桌面端可折叠侧边栏

## 快速开始

### Web（浏览器直接打开）

**模块化版本**（推荐）：
```
open "viewer v2.7.html"
```

**单文件版本**（自包含）：
```
open "viewer v2.6.html"
```

### Electron 开发

```bash
npm start
```

### Electron 构建

```bash
# 国内网络需设置 Electron 镜像
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run dist
```

构建输出：`release/米醋画图 Setup X.X.X.exe`

## 项目结构

```
Vibe_Paint/
├── app/                    # Electron 应用源码 (入口)
│   ├── index.html          # 模块化 HTML (加载 viewer.css + viewer.js)
│   ├── viewer.css          # 样式
│   ├── viewer.js           # 逻辑
│   ├── main.js             # Electron 主进程
│   └── package.json        # 应用声明
├── build/
│   └── remove-locales.js   # 打包后删除多余本地化文件
├── viewer v2.7.html        # 模块化版本 (开发用)
├── viewer.css              # 独立样式
├── viewer.js               # 独立脚本
├── package.json            # 根：Electron + electron-builder
└── README.md
```

## 技术栈

- 纯 HTML/CSS/JS，无框架，无构建
- Tailwind CSS CDN（首次加载需网络）
- localStorage 持久化配置与历史
- Electron + electron-builder（NSIS 安装包）

## 接口兼容

支持所有 OpenAI 兼容 API 端点：

| 模式 | 端点 | 说明 |
|------|------|------|
| images | `/v1/images/generations` | 文生图 |
| edits | `/v1/images/edits` | 图生图（支持多参考图） |
| chat | `/v1/chat/completions` | 对话生图 |

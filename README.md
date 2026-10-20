# 筑境家装内容工作台

## 启动

```bash
npm start
```

打开 `http://localhost:4173`。后端没有依赖包，使用 Node.js 18+ 自带的 HTTP 服务和 `fetch`。

## 接口

- `GET /api/health`：服务和 AI 配置状态
- `POST /api/projects/preview`：只生成方案，不保存素材
- `POST /api/projects`：保存项目、素材和生成结果
- `GET /api/projects/:id`：读取已保存项目
- `POST /api/projects/:id/render`：使用 FFmpeg 渲染竖屏 MP4
- `GET /media/:id.mp4`：访问渲染完成的成片

请求体为 JSON。素材上传字段格式为 `{ name, type, data }`，其中 `data` 是 base64 或 data URL。当前网页预览接口只提交文件元数据，避免浏览器把大文件重复传输；正式保存项目时使用 `/api/projects` 提交 base64 素材。

## 接入大模型

复制 `.env.example` 为 `.env`，填写 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL`。服务会调用 OpenAI 兼容的 `/chat/completions` 接口；没有 Key 时使用本地规则引擎，方便先验证产品流程。

## 当前边界

后端已经完成项目和素材的持久化、方案生成、AI Provider 接口和基础 MP4 渲染。生产环境可以再把 `renderProject` 放入独立的队列 Worker，避免大视频渲染占用 API 进程。

## 视频渲染

渲染接口已接入 `renderer.js`。本机需要安装 FFmpeg，并确保 `ffmpeg` 在 PATH 中，或在 `.env` 中设置 `FFMPEG_PATH`。当前渲染会把项目上传素材按顺序拼接为 1080x1920 竖屏视频。不同 FFmpeg 构建版的滤镜能力不同，因此品牌字幕目前由前端预览负责；生产环境可再接入带 `drawtext` 的 FFmpeg 构建版或预生成字幕图层。

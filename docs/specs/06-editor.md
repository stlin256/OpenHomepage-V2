# 可视化编辑器信息架构（细化项 #6）

> 状态：✅ 已实现（M5）。形态：`npm run admin` 本地 Web 服务，仅 PC，WYSIWYG（Milkdown），读写本地 data/。
> M7 增补：三种编辑模式（WYSIWYG / 源码 / 双栏预览）、预览服务一键启动、编辑器明暗主题。

## 1. 界面布局

```
┌────────────────────────────────────────────────┐
│ 顶栏: Logo  保存状态  [预览站点]  [中/EN]        │
├──────────┬─────────────────────────────────────┤
│ 侧栏      │  主编辑区                            │
│ ▸ 页面    │  （随侧栏选中项切换）                │
│   - index │                                     │
│   - 研究   │  页面 → Milkdown WYSIWYG 编辑器     │
│ ▸ 配置    │  （frontmatter 表单条置顶）          │
│   - 站点  │  配置 → 对应表单                    │
│   - GitHub│                                     │
│   - RSS   │                                     │
│   - 流式块 │                                     │
│   - 主题  │                                     │
│ ▸ 素材    │  素材 → 文件管理器                  │
└──────────┴─────────────────────────────────────┘
```

## 2. 功能模块

| 模块 | 内容 | 交互 |
|------|------|------|
| 页面 | data/pages/*.md 列表，新建/重命名/删除 | Milkdown WYSIWYG；frontmatter 以表单条（标题/导航开关/排序）呈现于编辑器顶部 |
| 站点配置 | site.yaml 的 site/profile/theme/bgm 段 | 表单：文本框、链接列表编辑器、模式切换；BGM（启用开关、素材库音频选择、音量滑块） |
| GitHub | username、贡献图开关、pinned 列表 | 表单：repo 列表支持增删、拖拽排序 |
| RSS | rss.yaml | 源列表编辑器：每个源可展开配 mode/latest/weight/cover；curated 文章子列表 |
| 流式块 | streaming_blocks + home.layout 排序 | 块定义表单 + 主页布局拖拽排序器 |
| 主题 | accent 取色器 | 头像候选色条（自动提取 4-6 色）+ 在头像上点取 + 手动色值输入 |
| 素材 | data/assets/ | 上传/删除/复制引用路径 |

## 3. 技术要点（实现注记，M5）

- 服务：`admin/server/`，**原生 node:http**（选型：零新增依赖、离线可装，API 简单不需要框架；放弃 fastify），端口默认 4174（`ADMIN_PORT` 可改），仅监听 127.0.0.1。
- 前端：`admin/ui/`，TS + Milkdown 单页应用；**esbuild 启动时内存打包**（选型：importmap 需手工维护 prosemirror 十余个包的映射，脆弱；vite 构建对单页小工具过重）。`admin/shared/` 为前后端共用纯函数（slugify/i18n/取色/autosave），全部有单测。
- API：`GET /api/info`、`GET /api/pages`、`GET/PUT /api/page`、`POST /api/page/create|rename|delete`、`GET/PUT /api/config/site|rss`、`GET /api/assets`、`POST /api/asset`（原始二进制上传）、`POST /api/asset/delete`、`GET /api/asset/file`、`GET /api/snapshots`、`POST /api/snapshot/restore`、`GET /api/dev-status`。REST 直写文件；所有路径参数经 `safeResolve` 规范化并限制在 data/ 内（含 URL 编码伪装防护）。
- 保存：**自动保存**（编辑停顿 ~1.5s 写盘，debounce 合并）；写盘前校验 schema（复用 `src/lib/config.ts` 的 `validateSiteConfig`/`validateRssConfig`，页面要求 frontmatter.title），失败不落盘并在顶栏提示。
- 编辑模式（顶部分段控件，M7）：
  - **所见即所得**：Milkdown 现状；
  - **源码**：等宽 textarea 直写 markdown（选型：CodeMirror 一套依赖 ~500KB 起步，对本工具过重，故用原生 textarea）；与 WYSIWYG 互切时内容经 Milkdown 序列化/解析保持同步（WYSIWYG→源码取 `getMarkdown()`，源码→WYSIWYG 用 `replaceAll()` 重建文档）；源码模式下"插入区块"改为插入到光标处；
  - **双栏预览**：一侧编辑（WYSIWYG 或源码，编辑面顶部有小切换）、一侧 iframe 指向 dev server 对应页面（`GET /api/page` 附 `previewPath`，URL 前缀规则与站点路由一致）；自动保存成功后刷新 iframe（Astro dev 按请求重新渲染）。
- 预览服务管理（M7）：dev server 未运行时预览面板给引导 + "启动预览服务"按钮 → `POST /api/dev/start` 由 admin server spawn `node node_modules/astro/bin/astro.mjs dev --port 4321`（直跑 CLI 避开 Windows .cmd 壳），从日志解析真实 Local URL（端口被占自动递增也能拿到），`POST /api/dev/stop` 停止；admin 退出（SIGINT/SIGTERM）时连带终止它 spawn 的子进程（Windows 走 `taskkill /T /F` 树杀，POSIX 杀进程组）。外部手动启动的 dev server 只探测不接管（stop 不动它）。进程/日志/端口逻辑在 `admin/server/devserver.ts`，spawn/probe/platform 全注入，有单测。
- 预览站点：按钮先探 `GET /api/dev-status`（探测 127.0.0.1:4321），已启动则打开新标签页，未启动则提示先 `npm run dev`。
- Milkdown 自定义节点：与 03 文档指令一一对应。叶指令（bilibili/youtube/stream/ghcard）与空容器指令（video/audio/figure）为原子节点；grid/grid_cell 为真嵌套容器（remark-directive 序列化自动让外层冒号多于内层）。编辑器里渲染为参数卡片，序列化回指令语法；往返有 jsdom 测试守护。figure 卡片支持 `src/caption/width` 文本输入与 `align`（left/center/right）下拉选择，写回 figure 指令参数（渲染侧见 spec 03 §2）。
- 粘贴图片：ProseMirror `handlePaste` 钩子拦截图片文件 → 上传 `POST /api/asset`（自动命名 `pasted-<时间戳>.<ext>`）→ 插入 image 节点引用 `assets/<name>`。
- 无 data/ 时编辑器启动自动从 data.example/ 初始化（复用 scripts/setup.mjs 逻辑），界面顶部横幅提示。

## 4. 已定细节

- ✅ 新建页面向导：输入标题自动生成 slug + frontmatter 模板。
- ✅ 粘贴图片直接入 data/assets/ 并插入 markdown 引用。
- ✅ 保存策略：**自动保存**（编辑停顿 ~1.5s 后写盘）+ **版本快照**：每次写盘前把上一版备份到 `data/.snapshots/<文件>/<时间戳>`，保留最近 20 版，支持回滚。`data/.snapshots/` 随 data/ 一同不入库。
- ✅ 编辑模式三态（M7）：所见即所得 / 源码 / 双栏预览，分段控件切换；双栏下编辑面可再切 WYSIWYG/源码。
- ✅ 预览服务一键启动/停止（M7）：`POST /api/dev/start|stop`，管理器见 `admin/server/devserver.ts`。
- ✅ 编辑器明暗主题（M7）：顶栏小方块按钮（太阳/月亮，与站点同款），复用站点语义 CSS 变量与 `src/lib/theme.ts` 纯逻辑；localStorage（`oh-admin-theme`）记忆，默认跟随系统；`index.html` 内联脚本防首帧闪烁。
- ✅ 界面文案全量走 i18n 字典（M7 补全）：静态扫描测试禁止 UI 代码出现未走字典的可疑英文字符串（白名单：路径/选择器/SVG/MIME/类名/专有名词）。

# OpenHomepage V2

[English](README.md)

轻量、杂志化排版的个人主页生成器——纯静态、中英双语，一切内容由本地 `data/` 文件夹（markdown + YAML）驱动。基于 Astro，经 GitHub Actions 部署到 GitHub Pages。

## 特性

- **Markdown 优先**——页面就是带 frontmatter 的 markdown 文件；渲染支持 GFM、Shiki 代码高亮、KaTeX 数学公式、自定义指令（`::bilibili`、`::youtube`、`:::video`、`:::audio`、`:::figure`、`::::grid`、`::stream`、`::ghcard`），并允许安全的 HTML 混写。
- **杂志化布局，科研式克制**——不对称 12 列网格、表现力动效（transform/opacity 实现）、明暗双主题（亮/暗两态切换，默认跟随系统；手动选择会话内保持、离开站点后重置）+ 可配置主题色。
- **图片灯箱**——正文图片点击放大预览（缩放淡入动画，遵循 reduced-motion），存在同名 `-full` 文件（如 `assets/hero-full.jpg`）时自动加载高清版。
- **背景音乐（可选）**——`site.yaml` 配置 `bgm` 段后，页顶出现播放/暂停按钮；`transition:persist` 保证站内转场不中断，记住用户选择，遵守浏览器自动播放策略与 reduced-motion。
- **GitHub 区块**——贡献热力图（对齐 GitHub 首页：月份/星期坐标轴、格子 tooltip、Less→More 图例、自定义滚动条）与 1:1 官网风 pinned 仓库卡（octicon 图标、topics pill、语言色点、star/fork/相对更新时间），构建时抓取。
- **RSS 卡片**——多源订阅，分栏/加权混排两种模式，支持精选文章列表与逐篇封面；精选条目未声明封面时自动抓取文章页 `og:image`（回退 `twitter:image` → 正文首个图片），外链封面加载失败自动隐藏图位；卡片点击直达原文。
- **LLM 流式区块**——预写 markdown 以拟真流式效果播放。
- **编辑风内容区块**——结构化列表卡片、图片磁贴、归档卡、动作按钮和分割线，配合暖色杂志化主页。
- **可选 i18n**——在 `data/pages/` 下增加第二种语言目录，整站（路由、导航、双语配置字段）自动启用；语言切换器（页顶翻译图标 + 弹出菜单）仅在当前页存在真实译文时出现。缺译页面按回退链静默渲染。
- **可视化编辑器（PC）**——`npm run admin` 启动本地 WordPress 式编辑器（Milkdown WYSIWYG），编辑页面与全部配置；所见即所得 / 源码 / 双栏实时预览三种编辑模式，dev 预览服务可一键启动；自动保存、版本快照、主题取色器、亮/暗主题齐备。
- **自部署静态服务**——`npm run serve` 直出 `dist/`（多页静态、正确 MIME、404 页），支持 SSL：`site.yaml` 的 `serve.ssl` 显式配置，或项目根 `certs/cert.pem` + `key.pem` 约定自动启用；证书缺失/无效时打印警告并降级 HTTP。
- **数据私有，仓库公开**——`data/` 不入库；CI 从 secret 指定的 zip 直链下载，失效时用上次部署快照回退，并借 GitHub 失败通知发邮件提醒。

## 快速开始

```bash
npm install
npm run setup       # 复制 data.example/ → data/（已存在则跳过）
npm run prefetch    # 抓取 GitHub + RSS 数据到 .cache/（首次体验可跳过）
npm run dev         # 本地预览
npm test            # 运行测试
npm run build       # 静态构建 → dist/
```

没有 `data/` 时站点回退到内置的 `data.example/`（完整的 AI 主题示例）并给出警告。

## 日常使用：启动与关闭

以下命令里，一次性任务跑完自动退出；长期运行的本地服务启动时会打印访问地址。

| 命令 | 作用 | 地址 | 如何关闭 |
|------|------|------|----------|
| `npm run admin` | 可视化编辑器（**自动连带启动站点预览服务**，已在跑则接管不重复拉起） | http://127.0.0.1:4174 + http://localhost:4321 | 在该终端窗口按 `Ctrl+C`（预览服务一并停止） |
| `npm run dev` | 只跑站点开发服务器（热更新，不需要编辑器时用） | http://localhost:4321 | 在该终端窗口按 `Ctrl+C` |
| `npm run prefetch` | 一次性：抓取 GitHub/RSS 数据到 `.cache/` | — | 跑完自动退出 |
| `npm test` | 一次性：运行测试 | — | 跑完自动退出 |
| `npm run build` | 一次性：静态构建 → `dist/` | — | 跑完自动退出 |
| `npm run preview` | 预览构建产物 `dist/` | http://localhost:4321 | `Ctrl+C` |
| `npm run serve` | 自部署静态服务 `dist/`（可选 HTTPS，见下文） | http://localhost:8080（或 https://localhost:8443） | `Ctrl+C` |

典型工作流（一条命令启动全部）：

```bash
npm run admin       # 编辑器 :4174 + 站点预览 :4321 一起拉起，在这里改内容、看实时预览
# ……结束后按一次 Ctrl+C：编辑器与它代启的预览服务一并停止（直接关终端窗口也行）
```

说明：

- 顶栏有预览服务状态指示灯（绿=运行 / 黄=启动中 / 灰=未运行），点击可手动停止/再启动；编辑器只停掉它代启的进程，你自己跑的 `npm run dev` 不受影响。
- 端口被占用（比如之前的 dev server 忘关了）：运行 `npx astro dev stop` 即可停止；或者 `netstat -ano | findstr :4321` 找到 PID 后 `taskkill /PID <pid> /F`；直接关掉旧终端窗口也行。
- `.cache/` 跨次运行复用（1 小时有效期）；想强制刷新用 `npm run prefetch -- --force`。

## 可视化编辑器

```bash
npm run admin       # → http://127.0.0.1:4174（仅监听回环地址）
```

- **页面**——侧栏按语言目录分组；Milkdown 所见即所得编辑，自定义指令渲染为**所见即所得预览卡**（figure 直出素材图片、bilibili/youtube/video/audio 播放器观感卡、ghcard 仓库卡读 pinned 缓存、stream 标题+摘要、grid 分栏可视边框），hover 卡片右上角铅笔按钮展开参数面板；frontmatter（title/nav/order/slug/description）以表单条呈现；新建向导（标题 → 自动 slug + 模板）、重命名、删除、一键"创建另一语言版"。编辑器内 `Ctrl+V` 粘贴图片自动存入 `data/assets/` 并插入引用。
- **编辑模式（三态分段切换）**——**所见即所得**（Milkdown）、**源码**（等宽 markdown 直写，与 WYSIWYG 互切时内容自动同步）、**双栏预览**（一侧编辑一侧 iframe 实时预览 dev server 页面；dev 未运行时可一键"启动预览服务"，编辑器退出时自动停止它代启的进程）。自动保存成功后预览自动刷新。
- **配置**——站点/资料/链接/站点图标（favicon：素材库 svg/png/ico 选择，或直接上传任意图片自动居中裁方、转换生成 180×180/32×32 PNG 并写回配置）、背景音乐（开关、素材库文件选择、音量滑块）、**页脚**（默认开启，开关 + 双语文本，支持 `[文字](链接)` 内联链接）、GitHub（用户名、贡献图开关、pinned 增删与上移下移排序）、RSS（源的 mode/latest/weight/cover 与精选文章子列表）、流式块定义、编辑区块与右下联系卡，以及可拖拽或按钮排序的 `home.layout`。
- **主题**——从头像自动提取 4–6 个候选色、点击头像任意像素取色或手动输入 hex；写回 `theme.accent` 并实时预览。
- **素材**——列表/上传（文件选择或拖拽）/删除/复制引用路径。
- **自动保存与快照**——编辑停顿 ~1.5s 自动写盘；每次写盘前把旧版本快照到 `data/.snapshots/<路径>/<时间戳>`（保留最近 20 版），界面可查看/回滚。写盘前做 schema 校验，失败不落盘并提示。
- 编辑器界面中英双语（顶栏切换，localStorage 记忆）+ 亮/暗主题切换（顶栏小方块按钮，localStorage 记忆，默认跟随系统）。首次启动若无 `data/` 会自动从 `data.example/` 初始化。
- **导出 data 压缩包**——顶栏"导出 data 压缩包"按钮把整个 `data/`（含 `.snapshots/` 版本快照）打包为 zip 下载，可直接作为 CI 的 `DATA_SOURCE_URL` 数据源（见下文部署一节）。

详见 [docs/specs/06-editor.md](docs/specs/06-editor.md)。

## 自部署静态服务（npm run serve）

`npm run build` 之后，可以不依赖 GitHub Pages、直接把 `dist/` 挂到自己的服务器：

```bash
npm run build
npm run serve       # → http://localhost:8080
```

- 多页静态直出（正确 MIME、`/research` → `research/index.html` 目录索引、404 页兜底），无 SPA 回退。
- **HTTPS**：在 `site.yaml` 里配置：

  ```yaml
  serve:
    port: 8443
    ssl:
      cert: "certs/cert.pem"
      key: "certs/key.pem"
  ```

  或按约定：项目根 `certs/` 下放好 `cert.pem` + `key.pem` 即自动启用（默认端口 8443）。自签名证书可用 `openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 3650 -nodes -subj "/CN=你的域名"` 生成（浏览器会提示不受信任，确认后继续；`certs/` 已加入 .gitignore）。
- 证书缺失、PEM 解析失败、证书与私钥不匹配 → 打印中文警告并降级 HTTP；证书过期仅警告不拒绝。

## 目录结构

```
data.example/   # 内置示例数据（入库）——编辑器内置演示
data/           # 你的真实内容（不入库）
docs/           # 设计文档：docs/design.md + docs/specs/*
skills/         # 指导 AI 编辑 data/ 的 skill
scripts/        # prefetch / setup 脚本
src/            # Astro 站点源码
admin/          # 可视化编辑器（admin/server = 本地 API，admin/ui = SPA，admin/shared = 纯逻辑）
tests/          # vitest 测试
```

## 部署

GitHub Actions 在 push 与定时（每 8 小时）触发，构建并发布到 GitHub Pages。需要的 Secrets：

| Secret | 用途 |
|--------|------|
| `DATA_SOURCE_URL` | `data/` 文件夹 zip 包的直链 |
| `GH_PAT` | GitHub PAT（`read:user`），用于贡献图 |

在线源失效时，CI 从上次部署产物中的快照恢复 `data/`，只刷新 GitHub/RSS 动态区块并完成部署，随后将该次运行标记为失败，以便你收到邮件提醒。详见 [docs/specs/08-workflow.md](docs/specs/08-workflow.md)。

### 托管 data.zip 获取直链的常见途径

`DATA_SOURCE_URL` 需要一个能直接下载到 zip 的 URL（无需登录、无跳转页面）。编辑器顶栏的"导出 data 压缩包"产出的 zip 可直接用于以下任一途径：

- **GitHub 私有仓库 Release 附件**：建一个私有仓库（如 `mysite-data`），把 zip 作为 release 附件上传，用 `https://github.com/<owner>/<repo>/releases/download/<tag>/data.zip` 形式的链接——配合 `GH_PAT`（release 附件需要 token 鉴权时，把 token 放在 workflow 的下载步骤里）；
- **对象存储**：阿里云 OSS / 腾讯云 COS / S3 / Cloudflare R2 等，上传 zip 后开私有读 + 签名长链（或公共读，自行权衡隐私）；
- **任意静态托管**：自己的服务器/NAS、静态文件托管服务，能给出直链即可。

## 文档

完整设计文档见 `docs/`（从 [docs/design.md](docs/design.md) 开始）；`skills/editing-data` 目录教 AI 如何安全地编辑 `data/`。

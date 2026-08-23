# OpenHomepage V2

[English → README.md](README.md)

轻量、杂志化排版的个人主页生成器——纯静态、中英双语，一切内容由本地 `data/` 文件夹（markdown + YAML）驱动。基于 Astro，经 GitHub Actions 部署到 GitHub Pages。

## 特性

- **Markdown 优先**——页面就是带 frontmatter 的 markdown 文件；渲染支持 GFM、Shiki 代码高亮、KaTeX 数学公式、自定义指令（`::bilibili`、`::youtube`、`:::video`、`:::audio`、`:::figure`、`::::grid`、`::stream`、`::ghcard`），并允许安全的 HTML 混写。
- **杂志化布局，科研式克制**——不对称 12 列网格、表现力动效（transform/opacity 实现）、明暗双主题（亮/暗两态切换，默认跟随系统；手动选择会话内保持、离开站点后重置）+ 可配置主题色。
- **图片灯箱**——正文图片点击放大预览（缩放淡入动画，遵循 reduced-motion），存在同名 `-full` 文件（如 `assets/hero-full.jpg`）时自动加载高清版。
- **背景音乐（可选）**——`site.yaml` 配置 `bgm` 段后，页顶出现播放/暂停按钮；`transition:persist` 保证站内转场不中断，记住用户选择，遵守浏览器自动播放策略与 reduced-motion。
- **GitHub 区块**——贡献热力图与 pin 项目卡片，构建时抓取。
- **RSS 卡片**——多源订阅，分栏/加权混排两种模式，支持精选文章列表与逐篇封面；卡片点击直达原文。
- **LLM 流式区块**——预写 markdown 以拟真流式效果播放。
- **可选 i18n**——在 `data/pages/` 下增加第二种语言目录，整站（路由、导航、回退链）自动启用；语言切换器仅在当前页存在真实译文时出现。
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
| `npm run dev` | 站点开发服务器（热更新，改完即看） | http://localhost:4321 | 在该终端窗口按 `Ctrl+C` |
| `npm run admin` | 可视化编辑器 | http://127.0.0.1:4174 | 在该终端窗口按 `Ctrl+C` |
| `npm run prefetch` | 一次性：抓取 GitHub/RSS 数据到 `.cache/` | — | 跑完自动退出 |
| `npm test` | 一次性：运行测试 | — | 跑完自动退出 |
| `npm run build` | 一次性：静态构建 → `dist/` | — | 跑完自动退出 |
| `npm run preview` | 预览构建产物 `dist/` | http://localhost:4321 | `Ctrl+C` |
| `npm run serve` | 自部署静态服务 `dist/`（可选 HTTPS，见下文） | http://localhost:8080（或 https://localhost:8443） | `Ctrl+C` |

典型工作流：

```bash
npm run dev         # 终端 1：实时预览 :4321，保持运行
npm run admin       # 终端 2：编辑器 :4174，在这里改内容
# ……编辑、看预览；结束后在两个终端各按一次 Ctrl+C 即可（直接关终端窗口也行）
```

说明：

- 两个服务相互独立，只需要哪个就启动哪个。编辑器里用"双栏预览"时若 dev server 未启动，可点"启动预览服务"由编辑器代启，编辑器退出时会自动把它停掉。
- 端口被占用（比如之前的 dev server 忘关了）：Windows 下 `netstat -ano | findstr :4321` 找到 PID 后 `taskkill /PID <pid> /F`；或在任务管理器里结束对应的 `node` 进程；直接关掉旧终端窗口也行。（Astro CLI 没有 `astro dev stop` 之类的停止命令，结束进程即可。）
- `.cache/` 跨次运行复用（1 小时有效期）；想强制刷新用 `npm run prefetch -- --force`。

## 可视化编辑器

```bash
npm run admin       # → http://127.0.0.1:4174（仅监听回环地址）
```

- **页面**——侧栏按语言目录分组；Milkdown 所见即所得编辑，自定义指令渲染为参数卡片；frontmatter（title/nav/order/slug/description）以表单条呈现；新建向导（标题 → 自动 slug + 模板）、重命名、删除、一键"创建另一语言版"。编辑器内 `Ctrl+V` 粘贴图片自动存入 `data/assets/` 并插入引用。
- **编辑模式（三态分段切换）**——**所见即所得**（Milkdown）、**源码**（等宽 markdown 直写，与 WYSIWYG 互切时内容自动同步）、**双栏预览**（一侧编辑一侧 iframe 实时预览 dev server 页面；dev 未运行时可一键"启动预览服务"，编辑器退出时自动停止它代启的进程）。自动保存成功后预览自动刷新。
- **配置**——站点/资料/链接、背景音乐（开关、素材库文件选择、音量滑块）、GitHub（用户名、贡献图开关、pinned 增删与上移下移排序）、RSS（源的 mode/latest/weight/cover 与精选文章子列表）、流式块定义，以及可拖拽排序的 `home.layout`。
- **主题**——从头像自动提取 4–6 个候选色、点击头像任意像素取色或手动输入 hex；写回 `theme.accent` 并实时预览。
- **素材**——列表/上传（文件选择或拖拽）/删除/复制引用路径。
- **自动保存与快照**——编辑停顿 ~1.5s 自动写盘；每次写盘前把旧版本快照到 `data/.snapshots/<路径>/<时间戳>`（保留最近 20 版），界面可查看/回滚。写盘前做 schema 校验，失败不落盘并提示。
- 编辑器界面中英双语（顶栏切换，localStorage 记忆）+ 亮/暗主题切换（顶栏小方块按钮，localStorage 记忆，默认跟随系统）。首次启动若无 `data/` 会自动从 `data.example/` 初始化。

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

## 文档

完整设计文档见 `docs/`（从 [docs/design.md](docs/design.md) 开始）；`skills/editing-data` 目录教 AI 如何安全地编辑 `data/`。

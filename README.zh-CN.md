# OpenHomepage V2

[English → README.md](README.md)

轻量、杂志化排版的个人主页生成器——纯静态、中英双语，一切内容由本地 `data/` 文件夹（markdown + YAML）驱动。基于 Astro，经 GitHub Actions 部署到 GitHub Pages。

## 特性

- **Markdown 优先**——页面就是带 frontmatter 的 markdown 文件；渲染支持 GFM、Shiki 代码高亮、KaTeX 数学公式、自定义指令（`::bilibili`、`::youtube`、`:::video`、`:::audio`、`:::figure`、`::::grid`、`::stream`、`::ghcard`），并允许安全的 HTML 混写。
- **杂志化布局，科研式克制**——不对称 12 列网格、表现力动效（transform/opacity 实现）、明暗双主题 + 可配置主题色。
- **GitHub 区块**——贡献热力图与 pin 项目卡片，构建时抓取。
- **RSS 卡片**——多源订阅，分栏/加权混排两种模式，hover 预览浮层，支持精选文章列表与逐篇封面。
- **LLM 流式区块**——预写 markdown 以拟真流式效果播放。
- **可选 i18n**——在 `data/pages/` 下增加第二种语言目录，整站（路由、导航、语言切换、回退链）自动启用。
- **可视化编辑器（PC）**——`npm run admin` 启动本地 WordPress 式编辑器，编辑页面与全部配置。*（开发中）*
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

## 目录结构

```
data.example/   # 内置示例数据（入库）——编辑器内置演示
data/           # 你的真实内容（不入库）
docs/           # 设计文档：docs/design.md + docs/specs/*
skills/         # 指导 AI 编辑 data/ 的 skill
scripts/        # prefetch / setup 脚本
src/            # Astro 站点源码
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

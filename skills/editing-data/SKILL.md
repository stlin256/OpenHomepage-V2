---
name: editing-data
description: 指导 AI 如何正确编辑 OpenHomepage V2 的 data/ 文件夹内容（页面 markdown、site.yaml、rss.yaml、流式区块、素材），用于"帮我改主页/加页面/改配置"类任务。
---

# 编辑 data/ 文件夹的规范

`data/` 是 OpenHomepage V2 的全部内容与配置来源，**不入 git**。权威 Schema 定义见 `docs/specs/01-config-schema.md`，编辑任何文件前先读它和相关细则文档（`docs/specs/`）。

## 目录结构

```
data/
├── site.yaml          # 站点配置（profile / theme / github / rss / home.layout / streaming_blocks）
├── rss.yaml           # RSS 源（display: grouped|mixed；sources 列表）
├── pages/             # 页面，按语言分目录，每个 *.md 自动成路由
│   ├── zh/            # 中文页面（index.md = 主页，slug 为 /）
│   └── en/            # 英文页面（可选；存在两个语言目录即自动启用 i18n）
├── streaming/         # 流式区块的预写 markdown，同样按 zh/ en/ 分目录
└── assets/            # 图片等素材
```

## 编辑规则

1. **页面**：改内容直接编辑 `data/pages/<语言>/<slug>.md`。新建页面必须写 frontmatter（`title`/`nav`/`order`，`slug` 可省略=文件名）。多语言：把文件复制到另一语言目录（如 `pages/zh/research.md` → `pages/en/research.md`）并翻译，frontmatter 的 `title` 也要翻译；缺译的页面会按「当前语言 → en → 默认语言」回退链展示并带提示条。
2. **markdown 扩展**：可用指令 `::bilibili{}` `::youtube{}` `:::video{}` `:::audio{}` `:::figure{}` `:::grid{}` `::stream{}` `::ghcard{}`，语法见 `docs/specs/03-markdown-directives.md`；支持 HTML 混写和 KaTeX（`$...$` / `$$...$$`）。
3. **配置文案双语**：site.yaml / rss.yaml 中面向用户的文案字段可写 `{zh: ..., en: ...}` 映射；存在多语言页面时应主动把区块标题等补成双语文案。
4. **主页布局**：区块顺序改 `site.yaml` 的 `home.layout` 列表；流式区块以 `- block: streaming` + `id:` 引用 `streaming_blocks` 中定义的块。
5. **RSS**：加源在 `rss.yaml` 的 `sources` 追加；curated 模式逐篇配 `url` + 可选 `note`/`cover`。封面规则：显式声明的 `cover` 优先；curated 条目未声明时 prefetch 会自动抓文章页提取 `og:image`（回退 `twitter:image` → 正文首个 img），无需手动声明；外链封面加载失败时前端自动隐藏图位。
6. **素材**：图片放入 `data/assets/`，markdown 里用 `assets/xxx.jpg` 相对路径引用。不要引用 data/ 之外的路径。
7. **校验**：改完 YAML 后用 `npm run validate`（若已实现）或至少 `npx js-yaml <file>` 校验语法；改完页面用 `npm run dev` 本地预览确认渲染无误。
8. **不要做的事**：
   - 不要把 data/ 提交进 git（已在 .gitignore，不要移除该规则）；
   - 不要在配置里写入 token/密码等机密（GitHub PAT 只配在仓库 Secrets）；
   - 不要手写 `.cache/` 里的文件（由 prefetch 生成）。

## 版本快照

编辑器自动维护 `data/.snapshots/` 版本历史；AI 直接编辑文件不会生成快照——大改前建议先 `cp` 备份目标文件，或提醒用户用编辑器做这类修改。

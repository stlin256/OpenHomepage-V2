---
name: editing-data
description: 指导 AI 如何正确编辑 OpenHomepage V2 的 data/ 内容与配置（页面、编辑区块、联系卡、主题底色、BGM、RSS/Feed、流式区块、学术成果、时间线、注记卡片、素材），用于"帮我改主页/加页面/改配置"类任务。
---

# 编辑 data/ 文件夹的规范

`data/` 是 OpenHomepage V2 的全部内容与配置来源，**不入 git**。权威 Schema 定义见 `docs/specs/01-config-schema.md`、`docs/specs/13-p0-content-academic-and-feed.md` 与 `docs/specs/14-p1-search-og-toc-playlist.md`，编辑任何文件前先阅读相关细则文档。

## 目录结构

```
data/
├── site.yaml          # 站点配置（site[含 favicon] / profile / theme / footer / contact / github / rss / bgm / feed / og_images / home.layout / editorial_blocks / streaming_blocks）
├── rss.yaml           # RSS 外部订阅源（display: grouped|mixed；sources 列表）
├── publications.yaml  # 学术成果数据（items 列表，可配 bibtex_file / highlight_authors / 分类 / 年份等）
├── publications.bib   # （可选）原始 BibTeX 条目库，与 publications.yaml 的 bibtex_key 关联以供一键复制
├── pages/             # 页面，按语言分目录，每个 *.md 自动成路由
│   ├── zh/            # 中文页面（index.md = 主页，slug 为 /）
│   ├── en/            # 英文页面（存在两个及以上语言目录即自动启用 i18n）
│   ├── ja/            # 日语页面（演示数据随附；语言目录任意，不限于演示的四种）
│   └── fr/            # 法语页面（演示数据随附）
├── streaming/         # 流式区块的预写 markdown，同样按语言分目录
└── assets/            # 图片、音视频、PDF 等静态素材
```

## 多语言

- **支持任意语言**：语言即 `pages/<语言码>/` 目录名，用主语言子标签（zh/en/ja/fr/de/ko/…，2–3 小写字母）。新增语言 = 新建目录 + 至少一个页面（建议先建 `index.md`）；路由、导航、hreflang、语言切换器自动生效，无需改代码。
- **默认语言**：`site.yaml` 的 `site.language`（如 `zh-CN`，取主标签 `zh`）。默认语言的 URL 不带语言前缀（`/`、`/research`），其他语言带前缀（`/en/`、`/de/research`）。演示数据的默认语言是中文。
- **回退链**：缺译内容按「当前语言 → en → 默认语言 → 任一可用版本」静默回退渲染；配置文案映射缺 key 回退 en → 默认语言。
- **语言切换器**：只显示当前页面真实存在译文的语言（回退渲染的语言不出现在菜单里），单语言站点不显示切换器。
- **编辑器创建**：后台「新建页面」向导的语言下拉 = 已有语言 + 常用语言（选中即新建语言目录）；页面编辑器的「创建另一语言版」弹窗同样列出可选目标语言（已拥有该页的语言不列出）。

## 编辑规则

1. **页面与 Frontmatter**：改内容直接编辑 `data/pages/<语言>/<slug>.md`。新建页面必须写 frontmatter：
   - 基础字段：`title`（必填）、`nav`（默认 true）、`order`（导航排序，小的在前，主页固定 0）、`slug`（缺省用文件名，主页固定 index.md 对应 `/`）、`description`（SEO）。
   - 增强字段：`toc: true|auto|false`（长文目录）、`toc_depth: 2-4`（目录深度，默认 3）、`reading_progress: true`（顶部阅读进度条）、`notice: "提示文案"`（或 `{text, color: "accent|yellow|red|custom", delay: 500}` 顶端通知横幅）、`date: "YYYY-MM-DD"`（发布日期，Feed 收录与排序）、`updated: "YYYY-MM-DD"`、`feed: false`（显式从本站 Feed 排除）、`og_image: "assets/..."`（社交分享卡片封面覆盖）。
   - 多语言：把文件复制到另一语言目录（如 `pages/zh/research.md` → `pages/en/research.md`）并翻译；缺译页面按回退链静默渲染。
2. **Markdown 扩展指令**：可用指令包括：
   - 媒体类：`::bilibili{bvid="..."}`、`::youtube{id="..."}`、`:::video{src="..." [poster="..."]}`、`:::audio{src="..." [title="..."] [description="..."] [cover="..."]}`（支持紧凑模式与带封面的卡片模式，与 BGM 保持独占播放/自动续播）。
   - 版式类：`:::figure{src="..." [caption="..."] [width="70%"] [align="left|center|right"]}`、`::::grid{cols=2}` + `:::cell`（嵌套指令外层冒号数必须多于内层）、`::stream{id="..."}`、`::ghcard{repo="owner/repo"}`、`::editorial{id="..."}`。
   - 注记卡片类：`:::note{title="..."}`、`:::tip{title="..."}`、`:::warning{title="..."}`、`:::important{title="..."}`、`:::quote{title="..." source="..."}`（语义化杂志风卡片，title 缺省自动多语言回退）。
   - 学术与经历类：
     - `::publications{tag="..." type="conference|journal|..." year="2026" group="year|type|none" sort="date-desc|date-asc|venue|order" limit="20"}`（学术成果列表，支持 BibTeX 一键复制与摘要折叠）。
     - `::::timeline{title="..."}` + `:::timeline-item{start="2022" [end="2026"] [title="..."] [org="..."] [url="..."] [highlight="true"]}`（经历时间线，**`start` 为必填项**，`end` 缺省自动显示当前“至今/Present”文案）。
   - 语法细则见 `docs/specs/03-markdown-directives.md`；支持 HTML 混写和 KaTeX（`$...$` / `$$...$$`）。`::editorial` 必须引用 `site.yaml` 中已定义的 `editorial_blocks` id。
3. **配置文案多语言**：`site.yaml` / `rss.yaml` / `publications.yaml` 中面向用户的文案字段可写多语言映射（如 `{zh: ..., en: ..., ja: ..., fr: ...}`，键为小写语言码、数量不限，按站点实际语言补齐；缺 key 按 `en → 默认语言` 回退）。
4. **主页布局与编辑区块**：
   - 顺序改 `site.yaml` 的 `home.layout`。
   - 流式区块以 `- block: streaming` + `id:` 引用；编辑风列表/磁贴/归档卡以 `- block: editorial` + `id:` 引用 `editorial_blocks` 中同 id 的定义；Markdown 正文以 `- block: markdown` 挂载；个人资料/GitHub/RSS 分别对应 `profile`、`github`、`rss`。
5. **背景音乐（BGM）与播放列表**：
   - 单曲模式：`bgm: { enabled: true, file: "assets/bgm.mp3", volume: 0.4, autoplay: true }`。
   - 多曲目播放列表模式：`bgm: { enabled: true, show_panel: true, tracks: [{ title: "...", artist: "...", src: "assets/...", cover: "assets/..." }] }`。桌面端 hover 图标呼出浮层，移动端点击呼出底部抽屉。
6. **右下联系卡**：配置在 `contact.intro_card`；`image` 必须指向 `data/assets/` 内可访问图片，通常是二维码。`delay` 会被限制到 1000–20000 ms。
7. **主题底色与样式**：`theme.background` 是浅色底色，缺省米黄；`theme.background_dark` 是暗色底色，缺省暖黑。两者必须是 `#rgb` 或 `#rrggbb`。
8. **RSS 与原创 Feed**：
   - 外部 RSS 聚合：加源在 `rss.yaml` 的 `sources` 追加；curated 模式逐篇配 `url` + 可选 `note`/`cover`（封面未显式声明时 prefetch 会自动抓取 `og:image`）。
   - 本站原创 Feed：在 `site.yaml` 中配置 `feed: { enabled: true, formats: ["rss", "atom", "json"], limit: 50 }`，自动生成各语言下的 `/feed.xml`、`/feed.atom.xml`、`/feed.json`。
9. **素材与灯箱**：图片放入 `data/assets/`，Markdown 和 YAML 里用 `assets/xxx.jpg` 相对路径引用（不要引用 data/ 之外的路径）。支持同名 `-full` 后缀约定（如 `assets/hero-full.jpg`）供灯箱优先加载高清大图；正文中引用的远程 http(s) 媒体构建时会自动本地化到 `data/assets/remote/`。
10. **校验与测试**：改完 YAML 至少用 YAML 解析器校验语法；跑 `npm test` 守护纯函数行为与组件逻辑，必要时跑 `npm run build` 验证静态构建产物。
11. **不要做的事**：
   - 不要把 data/ 提交进 git（已在 .gitignore，不要移除该规则）；
   - 不要在配置里写入 token/密码等机密（GitHub PAT 只配在仓库 Secrets）；
   - 不要手写 `.cache/` 里的文件（由 prefetch 与构建生成）；
   - 不要为编辑器加装饰性动效；反馈用明确的状态文本、焦点样式和原生控件表达。

## 版本快照

编辑器自动维护 `data/.snapshots/` 版本历史；AI 直接编辑文件不会生成快照——大改前建议先备份目标文件，或提醒用户用编辑器做这类修改。

## 编辑器能力速查

- 页面正文以「可视化编辑」为主：后台页面视图点击后在真实渲染页上直编（悬停描边、文本块就地微编辑器、指令/grid 右侧检查器、插入抽屉、页面设置面板，含长文目录提示与一键开启）。
- 后台页面视图保留 frontmatter 表单与整页源码编辑（兜底）；左侧菜单可通过顶栏按钮折叠，状态由浏览器记忆。
- 后台“编辑区块”页管理 `editorial_blocks` 与 `contact.intro_card`；“流式块”页管理流式块定义和 `home.layout`；「配置 → 学术成果」视图支持逐条增删改与 BibTeX 导入（DOI/标题去重，自动留快照）。
- 首次启动弹四步新手向导（场景预设 → 名片 → 模块 → 主题色），顶栏「🚀 新手向导」可随时重开；「配置 → 语言管理」勾选式启停语言（停用即把该语言目录归档至 `data/.archived_langs/`，可无损恢复）。
- 顶栏支持导出/导入 `data.zip`（导入前自动备份、拦截路径穿越）、「🔄 刷新动态数据」（重新抓取 GitHub/RSS 写入 `.cache/`）与「🚀 部署到线上」（Secrets 配置引导）；侧栏「工具 → 健康检查」等同 `npm run doctor`。
- 侧栏「发布」视图支持一键构建、构建成功后预览 dist（127.0.0.1:4399）与 OG 分享卡预览。
- 自动保存停顿约 1.5 秒；界面状态依次提示未保存、保存中、已保存或失败。
- 编辑区块表单用原生折叠面板组织；主页布局支持拖拽和上移/下移按钮。

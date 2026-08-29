# P0：学术内容表达与站点 Feed（2026-08-29）

> 状态：待实现。范围：论文/成果列表、履历时间线、杂志风注记卡片、本站原创内容 Feed。
> 目标：补齐科研主页的高频表达需求，同时保持 OpenHomepage-V2「纯静态、构建期渲染、默认零/极小前端 JS」的秒开路线。
> 全局约束：所有新能力必须适配手机/平板/桌面；明暗主题同时验收；按 TDD 实施；不得回退现有性能预算。

## 0. 共同原则与验收门槛

### 0.1 多端适配

- 断点沿用现有体系：`<=768px` 手机，`769–1199px` 平板/窄桌面，`>=1200px` 宽桌面。
- 手机优先设计：内容单列、触控目标 >= 44px、不依赖 hover；横向滚动仅允许在论文 badge/链接条溢出时出现，且必须显式滚动提示，不得裁断内容。
- 平板避免简单复刻手机：列表可使用更紧凑的行距与二列 metadata；宽桌面允许非对称杂志布局。
- 键盘可达：所有可操作元素为原生 `button`/`a`/`details`；焦点环使用现有主题 focus 样式；Esc、Tab 顺序符合直觉。
- 无障碍：语义结构、`aria-live`、`prefers-reduced-motion` 均纳入验收。

### 0.2 秒开与性能

- P0 功能默认构建期完成：论文列表、时间线、callout、Feed 均不引入页面初始化 JS。
- 唯一允许的前端交互是论文 BibTeX 复制按钮，采用事件委托与渐进增强；禁用 JS 时显示可选择的 BibTeX 文本。
- 新增图片必须进入现有 WebP/AVIF 与响应式 `sizes` 管线，指定宽高或稳定 aspect-ratio，避免 CLS。
- 新增页面级资源预算：
  - P0 内容块 CSS <= 4 KB gzip（可合并到现有全局样式，按区块拆分时不额外请求）；
  - BibTeX 交互 JS <= 1 KB gzip，且无论文区块时不执行任何逻辑；
  - 不新增首屏字体、不加载外部 CSS/JS/统计脚本；
  - Feed 只增加 `<head>` 链接，不增加客户端资源。
- 保持现有预算：首页总传输量 <= 1.5 MB，首屏 JS <= 60 KB gzip，Lighthouse Mobile Performance >= 90。

### 0.3 主题切换

- 新区块只允许使用现有语义色/accent CSS 变量，禁止硬编码明暗颜色。
- 浅色/深色、自定义 accent、自定义背景四种组合均需通过视觉检查；accent 在深色下沿用现有对比度校正。
- 主题切换时只发生颜色过渡，不重新布局；不得因 `picture`、badge、时间线边线产生闪烁。
- 页面首帧主题仍由 BaseLayout 内联脚本决定，新功能不得额外提前执行脚本。

### 0.4 TDD 流程

- 每个功能先提交 fixture 与失败测试，再实现：
  1. 纯函数/解析器单测；
  2. Markdown/配置归一化测试；
  3. HTML 快照或 DOM 结构测试；
  4. jsdom 交互测试（仅 BibTeX 复制）；
  5. 双主题截图与多端视口检查（纳入现有 screenshots runner 或独立视觉测试）。
- 不允许只改实现后补“通过即止”的测试；边界用例必须先在测试中命名。
- 所有 warning/error 文案保持中英双语，便于 CI 与本地定位。

---

## 1. 论文与学术成果列表

### 1.1 用户目标

用一个数据驱动、可筛选、可分组的静态列表展示论文、预印本、期刊文章、系统演示、thesis 等成果；访问者能快速看懂发表场合、作者贡献位置、PDF/代码入口，并复制 BibTeX。

### 1.2 数据模型

新增 `data/publications.yaml`；`data.example/publications.yaml` 提供不少于 6 条、覆盖不同类型与语言的示例。

```yaml
enabled: true
bibtex_file: "publications.bib"   # 可选；相对 data/
highlight_authors: ["Zhiyuan Lin"]
items:
  - id: "efficient-inference-2026"
    title: "Efficient Inference with Adaptive Scheduling"
    authors: ["Zhiyuan Lin", "Alice Doe", "Bob Smith"]
    year: 2026
    date: "2026-05-12"           # ISO 日期；排序优先 date，其次 year
    type: "conference"            # conference | journal | workshop | demo | preprint | thesis
    venue: "OSDI 2026"
    venue_short: "OSDI"
    badges: ["oral"]              # oral | spotlight | poster | artifact | custom ASCII label
    tags: ["systems", "inference"]
    note:
      zh: "第一作者，负责调度器设计与评测。"
      en: "First author; led scheduler design and evaluation."
    abstract:
      zh: "可选摘要，支持多语言映射。"
      en: "Optional abstract."
    links:
      pdf: "assets/papers/inference.pdf"
      code: "https://github.com/owner/repo"
      project: "/research"
      slides: "assets/papers/inference-slides.pdf"
      dataset: "https://example.com/dataset"
    bibtex_key: "lin2026efficient"
    teaser: "assets/papers/inference-teaser.jpg"
    order: 10                     # 可选；同日期内稳定排序，小值在前
```

规则：

- `title`、`authors`、`venue`、`year` 为必填；`id` 唯一，缺省由 title+year slug 生成，但示例与 admin 生成的条目必须显式写 `id`。
- `note`、`abstract` 支持 `resolveText` 的多语言映射与回退链；论文原题、作者、venue 不自动翻译。
- `highlight_authors` 大小写不敏感匹配作者名，匹配项加粗并使用 accent 下划线；不匹配任何作者时 warning，不阻断构建。
- `badges` 内置标签提供默认图标/样式，custom label 只允许安全文本，长度 <= 24，超出截断并 warning。
- `links` 值支持站内路径与 http(s)；仅 `pdf` 允许相对 `assets/` 路径，其他二进制类型后续扩展。
- `teaser` 必须是本地资源；远程资源先进入现有 remote-assets 本地化，再进入图片优化。
- `bibtex_file` 可选。YAML 中的 `bibtex_key` 缺失时仍渲染条目但不显示复制按钮；文件中找不到 key、重复 key、括号不平衡分别 warning。YAML 结构非法则构建失败。

### 1.3 BibTeX 读取

新增小型构建期解析器（不引入运行时依赖）：

- 只负责按 `@type{key,` 前缀和花括号深度定位 entry，保留原始 BibTeX 文本；
- 不重排字段、不改大小写、不尝试语义化作者/年份；
- 输出 `Map<lowercase(key), rawEntry>`；
- 顶层注释、`@string`、`@comment` 不作为论文 entry；后续如需 `@string` 展开另立 spec；
- 解析错误只影响对应 entry，不在页面中输出未转义文本。

### 1.4 Markdown 指令

```markdown
::publications{limit="20" tag="systems" type="conference" year="2026" group="year" sort="date-desc"}
```

- 参数均可省略；缺省渲染全部启用的条目，`group="year"`。
- `sort` 支持 `date-desc`（默认）、`date-asc`、`venue`、`order`；`venue` 排序在同级内保持稳定。
- `tag` 可写单个值或逗号分隔多值，语义为 AND；不支持的值返回空态提示，而不是渲染错误。
- `group` 支持 `none | year | type`；`year` 以新到旧分组，`type` 按固定类型优先级分组。
- 多语言文案由构建管线传入当前内容语言，不从用户 Markdown 中硬编码。
- 未知/缺参行为沿用现有指令规则：编辑模式渲染可点击占位卡；生产模式降级为原文。

### 1.5 渲染与交互

输出结构：

```html
<section class="publications" data-group="year">
  <article class="publication-item">
    <div class="publication-index">01</div>
    <div class="publication-main">
      <div class="publication-meta">OSDI 2026 · Conference · Oral</div>
      <h3>Efficient Inference with Adaptive Scheduling</h3>
      <p class="publication-authors">…</p>
      <details><summary>Abstract</summary>…</details>
      <div class="publication-links">PDF / Code / Project / Slides / Dataset</div>
      <button type="button" data-copy-bibtex="…safe id…">Copy BibTeX</button>
    </div>
    <picture class="publication-teaser">…</picture>
  </article>
</section>
```

- 条目主信息先于 teaser 加载；teaser `loading="lazy"`、`decoding="async"`，手机默认显示在文字后，不挤占标题。
- Abstract 使用原生 `<details>`，默认关闭；打开/关闭不产生 JS 请求。
- BibTeX 原文放在按钮旁的隐藏可聚焦区域，复制按钮用事件委托处理：
  - 成功：按钮文本短暂变为 “Copied”，`aria-live=polite`；
  - 失败：显示 “Press Ctrl/Cmd+C”，并聚焦 `<pre>`；
  - 复制内容为构建期保留下来的原始 BibTeX；
  - 该 `<pre>` 加 `data-pagefind-ignore`，避免未来搜索索引被 BibTeX 噪声污染。
- 无 JS：仍显示完整论文信息，BibTeX 文本可手动选择复制。

### 1.6 布局

- `>=1200px`：编号/主内容/teaser 的非对称三段布局；无 teaser 时主内容自然扩展。
- `769–1199px`：teaser 变为右侧小图或第二行小图，metadata 单行压缩。
- `<=768px`：单列；编号与年份合并为小标签，链接条可横向滚动，按钮高度 >= 44px。
- 超长英文题名与超长 venue 不截断正文，只允许在 badge 上 ellipsis；中英日法混排不得溢出。

### 1.7 TDD 验收用例

- YAML 归一化：必填缺失、非法 type/date/link、多语言回退、重复 id、空列表。
- BibTeX parser：普通 entry、嵌套 brace、重复 key、缺 key、非法 UTF-8 字符容错。
- 指令：过滤 AND、limit、group/sort、空结果、生产降级与编辑占位。
- HTML：作者高亮、链接协议白名单、details 结构、teaser 属性、BibTeX 转义。
- 交互：clipboard 成功/失败、重复点击、无 JS 快照。
- 视觉：3 个断点 × 明暗主题；截图文件命名沿用 `publications-{lang}-{mode}.webp`。

---

## 2. 履历与里程碑时间线

### 2.1 语法

```markdown
::::timeline{title="Education & Experience"}
:::timeline-item{start="2022" end="2026" title="PhD Candidate" org="Example University" url="https://example.edu" highlight="true"}
负责系统方向研究，并维护开源评测工具。
:::
:::timeline-item{start="2026" title="Research Intern" org="Example Lab"}
:::
::::
```

- `title` 可选；缺省只显示条目正文。
- `start` 必填；`end` 可空表示 “Now/Present”，由页面语言本地化。
- `org`、`url` 可选；`highlight="true"` 使用 accent 强调。
- 条目正文支持现有 Markdown 子集；内部禁止再嵌套 `timeline`，允许普通段落、列表和 callout。
- 嵌套围栏遵循现有规则：外层冒号数多于内层。

### 2.2 渲染

- 输出语义 `<section aria-labelledby>` + `<ol class="timeline">` + `<li class="timeline-item">`。
- 每项左侧为细线与节点，右侧为时间/标题/机构/正文；相邻条目共享一条连续竖线，不用重复背景。
- `end` 缺省时显示内置 “Now/Present” 字典文案，支持 zh/en/ja/fr 并按现有 i18n 回退。
- 无 JS、无 IntersectionObserver；可选淡入样式复用现有 `.reveal`，首屏不隐藏。
- 页内锚点：每项自动生成稳定 `id`，可供其他页面链接。

### 2.3 布局与主题

- `>=1200px`：左侧年份/机构信息列 + 右侧内容列，形成杂志化目录感。
- `769–1199px`：保留细线，但时间与标题上下堆叠；节点不因文本换行错位。
- `<=768px`：竖线靠左，正文右侧展开；触控不要求精确 hover；图标和节点尺寸 >= 12px，操作链接 >= 44px。
- 主题：竖线、节点、highlight、hover/焦点状态全部走 CSS 变量；深色下节点边框不消失。
- `prefers-reduced-motion`：不添加时间线专属动画。

### 2.4 TDD 验收用例

- 指令解析：单条、多条、缺 `start`、非法日期区间、嵌套 timeline 拒绝。
- 本地化：`end` 缺省文案、四语言回退。
- HTML：`ol/li` 语义、锚点唯一、URL 协议白名单、highlight 属性。
- 编辑器：timeline/timeline-item 加入 directive 元数据；item 正文可被现有块编辑坐标识别。
- 视觉：3 断点 × 明暗 × 长标题/短标题。

---

## 3. 杂志风注记卡片 Callouts

### 3.1 语法

```markdown
:::note{title="Note"}
默认标题由页面语言解析。
:::

:::tip{title="可选标题"}
...
:::

:::warning
...
:::

:::important
...
:::

:::quote{source="Author, 2026"}
...
:::
```

- 类型：`note`、`tip`、`warning`、`important`、`quote`。
- `title` 可选；缺省使用内置多语言标签（当前语言 → en → zh）。
- `quote` 支持 `source`；其他类型忽略 `source` 并 warning。
- 正文支持完整 Markdown 子集，不允许嵌套同类 callout；可嵌套在 grid/cell 内。

### 3.2 视觉与结构

- 输出 `<aside class="callout callout-note" role="note">`；`warning`/`important` 分别使用现有 warning/danger 语义色，不新造颜色体系。
- 图标为内联 SVG，`aria-hidden=true`；标题进入 `<p class="callout-title">`。
- `quote` 使用大引号/竖线排版，不显示 alert 图标；`role` 为 `note`，避免误用 `alert`。
- 卡片背景使用 `color-mix` 或预计算透明变量；必须同时适配自定义背景与 accent。
- 手机不悬浮、不折叠，保持单列阅读；宽屏宽度跟随宿主容器，不强制 100% 视口。

### 3.3 TDD 验收用例

- 每种类型的渲染、缺省标题、自定义标题、非法嵌套。
- 多语言标签回退。
- sanitize：title/source 转义，不允许事件属性。
- 编辑器 directive 元数据与插入菜单。
- 视觉：明暗 × accent × 嵌套 grid。

---

## 4. 本站原创内容 Feed

### 4.1 配置

```yaml
feed:
  enabled: true
  formats: ["rss", "atom", "json"]   # 至少一个；默认 rss+atom
  limit: 50                          # 1–200，默认 50
  include_home: false
```

页面 frontmatter 扩展：

```yaml
date: 2026-08-29       # 可选 ISO 日期；无 date 的页面默认不进 feed
updated: 2026-08-30
feed:
  enabled: true       # 缺省 true；设为 false 强制排除
  summary: "可选摘要；缺省截取正文前 300 字符"
```

- feed 只收录本站原创页面，不收录外部 RSS 聚合结果。
- i18n 站点中，每个 slug 只输出该 slug 真实存在的语言版本；回退渲染不生成重复 item。
- 无日期页面可通过 `feed.enabled=true` 收录，排序值为文件构建探测时间之外的显式 `order`；若两者都没有则 warning 并跳过。

### 4.2 路由与内容

- 默认语言：`/feed.xml`（RSS 2.0）、`/feed.atom.xml`、`/feed.json`。
- 非默认语言：`/{lang}/feed.xml`、`/{lang}/feed.atom.xml`、`/{lang}/feed.json`。
- `<head>` 输出对应 alternate link；默认语言输出 `x-default` 语义的首页 canonical，不做自动语言重定向。
- item 字段：
  - title、canonical URL、published/updated、summary、content HTML；
  - content 由现有 Markdown 管线渲染后 sanitize，站内资源转为绝对 URL；
  - language、页面 slug、可选 tags 进入各自格式允许的扩展字段。
- RSS/Atom/JSON 均为构建期 XML/JSON 字符串，不经过客户端处理。
- 输出声明 UTF-8；XML 转义用专门函数，禁止手拼属性。
- Feed 总量超过 limit 时按日期新到旧截取，并在 channel metadata 中保留 `lastBuildDate`。

### 4.3 性能与运维

- feed 文件为静态输出，可由 GitHub Pages/CDN 长缓存；建议响应 `Cache-Control: public, max-age=3600`。
- 单个 feed 目标 <= 256 KB；超限时 warning，不静默截断正文；用户可通过 `formats`/`limit` 调整。
- 不阻塞页面构建：feed 无有效 item 时 warning 并跳过端点输出，页面正常部署。
- CI 构建后可用 XML/JSON parser 校验输出。

### 4.4 TDD 验收用例

- frontmatter 归一化、date/updated 校验、include/exclude、多语言真实版本去重。
- XML/JSON 字段与转义：`&`、引号、CDATA、中文、含 `--` 的标题。
- 绝对 URL、base URL 子路径、站内链接本地化。
- RSS 2.0 / Atom 1.0 / JSON Feed 1.1 结构化测试。
- 输出体量超限 warning 与 limit 截断。

---

## 5. Admin / 编辑器集成

P0 不要求一次完成所有可视化编辑，但新指令必须不破坏现有 overlay：

- `note/tip/warning/important/quote`、`publications`、`timeline/timeline-item` 加入 `admin/shared/directives.ts`：
  - 插入菜单分组显示；
  - 参数表单使用本 spec 的枚举/校验规则；
  - timeline item 正文进入可编辑块坐标。
- `publications.yaml` 在 Admin 配置页作为独立表单或只读结构视图上线：
  - 第一阶段允许源码编辑 + schema 校验；
  - 第二阶段再做逐条表单、拖拽排序与 BibTeX key 选择；
  - 数据快照与撤销/重做沿用现有机制。
- Feed 配置进入站点设置表单；页面设置提供 date/updated/feed 开关。

---

## 6. 实施顺序（TDD Milestones）

1. **M13a Callouts**：失败测试 + directive 元数据 + 双主题样式 + overlay 插入。
2. **M13b Timeline**：解析/渲染测试 + 三端布局 + overlay 参数与正文编辑。
3. **M13c Publications data/parser**：YAML/BibTeX fixtures + 归一化与排序筛选。
4. **M13d Publications UI/UX**：HTML 结构、复制交互、teaser 优化、双主题截图。
5. **M13e Feed**：frontmatter/route/data 测试 + 三格式输出 + CI 校验。
6. **M13f Admin integration**：schema 表单、指令插入、快照/撤销回归。

每步完成标准：测试先行、所有旧测试通过、双主题截图更新、README/spec 中新增字段同步。

## 7. 非目标

- 不做评论、点赞、访问统计。
- 不做在线 BibTeX 格式化或 DOI 全量元数据抓取。
- 不做简历 PDF 自动生成。
- 不做.timeline 无限滚动或动态筛选；P0 保持静态。

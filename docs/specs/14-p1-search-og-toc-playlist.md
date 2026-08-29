# P1：搜索、社交分享、长文导航与播放列表（2026-08-29）

> 状态：待实现。范围：`Ctrl/Cmd+K` 静态搜索、构建期 OG 分享图、长文 TOC/阅读进度、BGM 多曲目播放列表。
> 目标：提升可发现性与长内容阅读体验，但不把“静态个人主页”变成重前端应用；所有交互均为渐进增强。
> 共同约束沿用 `13-p0-content-academic-and-feed.md` §0：三端适配、秒开预算、双主题验收、TDD。P1 额外要求所有功能在 JS 失败/索引缺失/字体缺失/音频不支持时均可回退，不影响内容阅读。

## 0. P1 全局补充约束

### 0.1 渐进增强

- 正文内容必须先可用：搜索、TOC 进度、播放列表控件、OG 图片都不能成为内容渲染的前置条件。
- 新交互脚本只允许在对应功能存在于当前页时初始化；没有该功能的页面不得加载或执行专属逻辑。
- 交互失败时保留无 JS 路径：
  - 搜索：入口不出现或显示 “Search unavailable”；
  - TOC：目录仍为可展开内容，进度条隐藏；
  - 播放列表：原单曲 BGM 逻辑保留；
  - OG：不生成图片时不得阻塞部署，只 warning。

### 0.2 秒开预算

- P1 新增首屏 JS 总量目标 <= 12 KB gzip（不含按需加载的 Pagefind chunk）。
- 搜索：
  - 首次路由不加载索引；
  - 首次打开 modal 才请求 Pagefind entry chunk；
  - 入口/快捷键/面板壳逻辑 <= 3 KB gzip；
  - Pagefind 分片按查询词懒加载，空搜索不请求结果分片；
  - 首次打开到可输入目标 <= 200ms（本地静态服务，不含慢速网络）。
- OG：构建期生成，页面只新增 meta 标签，客户端 JS 为 0。
- TOC：服务端渲染目录；交互脚本 <= 2 KB gzip。
- 播放列表：服务端渲染隐藏面板；交互脚本 <= 5 KB gzip；音频与封面均不参与首屏加载。
- P1 完成后仍需满足 Lighthouse Mobile >= 90、首页总传输量 <= 1.5 MB、首屏 JS <= 60 KB gzip。

### 0.3 主题切换与转场

- Modal、drawer、TOC、播放列表均使用 `data-theme` 下的语义变量；禁止在 JS 中计算明暗色。
- 主题切换时使用现有 `.theme-switching` 200ms 颜色过渡，不重排、不闪白。
- 站内页面交换后重新扫描 DOM，事件采用委托；不能因为路由切换重复绑定或丢失主题状态。
- `prefers-reduced-motion: reduce`：关闭 modal 弹跳、TOC 高亮动画、进度条平滑跟随；保留状态变化。

---

## 1. 静态全局搜索（Ctrl/Cmd+K）

## 1.1 用户目标

访问者按 `Ctrl+K` / `Cmd+K` 或点击搜索图标，打开杂志风命令面板，快速定位站内页面与长文小节；多语言站点能按语言过滤，中文搜索不退化。

## 1.2 技术选型

- 使用 Pagefind 构建期索引，理由：
  - 静态输出后索引，能覆盖最终 HTML/图片重写结果；
  - 分片加载，适合秒开；
  - 内置多语言分词能力，适合当前 zh/en/ja/fr 演示。
- 不引入 React/Vue，不引入后端搜索服务。
- 构建顺序调整为：
  1. `astro build`
  2. 现有图片优化与 HTML 重写
  3. `pagefind --site dist`
  4. 搜索 UI 元数据/清单校验
- Pagefind 索引产物位于 `dist/pagefind/`，与站点一同部署。

## 1.3 索引边界与多语言

- 索引 `main` 内容与页面标题；排除：
  - 复制的 BibTeX `<pre>`（`data-pagefind-ignore`）；
  - 灯箱骨架、导航菜单重复文本、隐藏模板；
  - RSS/GitHub 动态卡片可索引标题，但源 URL 只作为结果元数据。
- `<html>` 输出 `data-pagefind-lang="{contentLang}"`；索引 filter 使用语言码。
- 默认搜索范围：
  1. 当前 URL 语言；
  2. 无结果或用户切换 “All languages” 时，搜索全部语言；
- 结果显示语言名，重复 slug 的多语言结果分组排列，不互相挤掉。
- i18n 回退页面不重复索引：索引真实内容语言，URL 保留访问语言；结果点击仍进入原语言路由。
- 中文/日文测试必须覆盖连续中文、中英混排、标题/正文命中；若 Pagefind 对某语言分词不达标，先记录已知限制，不静息降级。

## 1.4 UI 与交互

入口：

- 桌面：顶栏工具区搜索 icon button，快捷键 `Ctrl+K` / `Cmd+K`，`/` 不抢占输入框。
- 手机：顶栏搜索 icon button；也可在触屏上直接点按打开。

Modal：

```html
<dialog class="search-dialog" aria-label="Search">
  <form role="search">
    <input type="search" autocomplete="off" spellcheck="false" />
    <button type="button" data-scope="current">This language</button>
    <button type="button" data-scope="all">All languages</button>
  </form>
  <ul class="search-results" role="listbox"></ul>
  <p class="search-status" role="status"></p>
</dialog>
```

- 键盘：Esc 关闭；Up/Down 移动 active；Enter 跳转；Home/End 支持；焦点循环；打开时焦点 input，关闭后焦点还原触发按钮。
- 结果：标题、小节 anchor、语言标签、摘要高亮；最多显示 8 条，显示 “More matches” 而非一次性渲染全部。
- 输入防抖 120ms；请求代际号递增，旧响应不能覆盖新查询。
- 加载/空态/错误态均由 `role=status` 播报，不用 alert。
- 无匹配时不自动跳转 Google 或外部搜索。

## 1.5 多端与主题

- `>=1200px`：居中 modal，宽度 640–720px，可显示快捷键提示。
- `769–1199px`：宽度 min(92vw, 640px)，结果行双行摘要。
- `<=768px`：底部 sheet，顶部 safe-area padding，虚拟键盘弹出时内容区可滚动，结果触控行高 >= 48px。
- 明暗主题：半透明遮罩、毛玻璃、结果 active 状态、摘要高亮全部走语义变量；对比度满足 WCAG AA。
- 搜索索引缺失时，入口隐藏或禁用；不显示空白面板。

## 1.6 TDD

- 纯函数：语言过滤、结果排序/分组、查询代际、快捷键忽略输入框。
- jsdom：打开/关闭、焦点还原、键盘导航、loading/empty/error 状态、重复打开缓存。
- 构建集成：生成 `pagefind/`，索引排除 BibTeX/灯箱；HTML 校验 `data-pagefind-*`。
- Playwright：中文/英文搜索、语言切换后搜索、手机视口打开、主题切换后面板样式。
- 性能测试：未打开搜索前断言无 pagefind 请求；首次打开后 entry chunk 缓存。

---

## 2. 构建期 OG 分享图

## 2.1 用户目标

每个页面在微信、X/Twitter、Telegram、LinkedIn 等平台分享时，自动获得统一、专业且带页面标题的社交卡片，不需要用户手动设计每页图片。

## 2.2 配置

新增：

```yaml
og_images:
  enabled: true
  layout: "editorial"       # editorial | minimal | image
  cache: true
  format: "png"             # P0 仅 png；质量/尺寸固定
  show_avatar: true
  show_site_title: true
  accent_bar: true
  background: "theme"       # theme | light | dark；默认使用浅色主题版式
  default_image: ""          # 可选；未启用自动生成时的兜底图
```

页面 frontmatter 覆盖：

```yaml
og_image: "assets/social/research.png"
og_title: "Research"
og_description: "My research projects"
```

- `og_image` 存在时直接使用，跳过生成；路径必须为本地资产，输出绝对 URL。
- 缺省标题取页面 title，描述取 description/site description。
- 首页卡片可额外显示 `profile.tagline`；非首页优先显示页面标题，避免长文本。

## 2.3 生成管线

- 输出尺寸：1200×630 PNG，另生成 600×315 缩略图仅作为构建校验，不默认输出双份 meta。
- 默认模板：
  - 左上：site title / small monogram；
  - 中央：page title（最多 3 行，超长省略）；
  - 下方：profile.tagline 或 site description；
  - 右下/底部：domain；
  - 使用 `theme.background` 浅色值与校正后的 accent；不跟随访问者实时主题。
- 实现建议：`satori` 生成 SVG，`@resvg/resvg-js` 转 PNG；不得在页面运行时生成。
- 字体策略：
  - 使用开源可嵌入字体（Noto Sans/Serif SC + JetBrains Mono）；
  - 构建期收集页面标题、站点标题、tagline、domain 的实际字符集，生成 glyph subset；
  - subset 缓存在 `.cache/og-fonts/`，按字符集 hash 复用；
  - 缺少必要字形时输出 warning 并改用 `default_image`，不得输出豆腐块。
- 缓存：
  - 输入 hash = title + description + site title + lang + layout + theme + template version + font version；
  - 图片缓存于 `.cache/og-images/`，产物复制/命名为 `dist/assets/og/{hash}.png`；
  - 同 hash 构建不重复栅格化。
- CI 传入 `ASTRO_SITE`；缺省时仍生成图片，但 warning 且 meta URL 使用相对路径提示部署配置不完整。

## 2.4 Meta 输出

每个页面输出：

```html
<meta property="og:type" content="profile|article|website" />
<meta property="og:title" content="…" />
<meta property="og:description" content="…" />
<meta property="og:url" content="…" />
<meta property="og:image" content="{absolute-url}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="…" />
<meta name="twitter:card" content="summary_large_image" />
```

- URL、title、description 全部 HTML 转义。
- hreflang 多语言页面各自输出对应语言卡片。
- 不输出重复 `og:*`；已有用户 frontmatter 优先。
- 构建后扫描 HTML，验证每页有且仅有一个 `og:image` 与 `twitter:image`。

## 2.5 性能与运维

- 客户端 JS 为 0；图片仅由爬虫或分享预览拉取。
- 单张 PNG 目标 <= 150 KB，硬上限 256 KB；超限 warning 并尝试降低纹理复杂度/字号层级，不允许静默改变模板文本。
- OG 图片不参与页面 idle prefetch，不进入 `<img loading>` 首屏资源。
- 生成失败不阻断部署；输出 warning 与未覆盖页面列表。
- 构建时间目标：缓存命中时 < 2s；50 页全量冷生成 < 45s。

## 2.6 多端、主题与 TDD

- OG 卡片本身固定亮色或配置指定，不响应访问者主题切换；站点实时主题能力不受影响。
- 模板需覆盖中英日法、超长标题、多行描述、无头像、无 tagline、深色背景配置。
- 测试：
  - hash 输入稳定性与缓存命中；
  - 字符集收集/字体 subset；
  - PNG 尺寸、文件大小、非空白像素校验；
  - meta 去重与转义；
  - `og_image` frontmatter 覆盖；
  - 生成失败降级。
- 每个模板保留 3–5 张金样本图片，视觉 diff 只防结构性回归，不要求像素级完全一致。

---

## 3. 长文目录导航与阅读进度

## 3.1 配置

页面 frontmatter：

```yaml
toc: auto          # true | false | auto；默认 false 保持兼容
toc_depth: 3       # 2–4，默认 3
reading_progress: true
```

- `auto`：正文 >= 1,800 字或 h2/h3 数量 >= 4 时启用。
- 仅扫描页面正文 Markdown，不扫描导航、GitHub/RSS 卡片、streaming 动画内容。
- 手动 `toc: true` 时即使标题少也渲染；`false` 永不渲染。

## 3.2 标题锚点

- 渲染管线为 h2–h4 生成稳定 slug：
  - 先用页面语言和标题文本生成可读 slug；
  - 冲突时追加 `-2`、`-3`；
  - 空/纯符号标题使用 `section-{index}`。
- 标题 slug 在同一路由内稳定；多语言路由允许不同 slug。
- Markdown 手写自定义 `id` 优先，不覆盖。
- sanitize 白名单允许 `id` 与 `aria-hidden`。

## 3.3 布局

- `>=1200px`：
  - 页面主内容右移，右侧 sticky TOC 栏；
  - TOC 不遮正文，不造成首屏 CLS；
  - h2 一级，h3/h4 缩进，h4 可折叠或弱化。
- `769–1199px`：
  - 文章开头显示可展开 `<details class="toc">`，默认长文展开、短文关闭；
  - 不占用 sticky 区域。
- `<=768px`：
  - 文章开头显示可展开 TOC；
  - 点击后滚动到目标并关闭 TOC，避免遮挡；
  - 顶部阅读进度条高度 2px，位于 header 下方，考虑 safe-area。
- 无 JS：TOC 链接仍可跳转；进度条不渲染。
- 目录不进入搜索索引重复内容，外层标 `data-pagefind-ignore`。

## 3.4 阅读进度与 ScrollSpy

- 进度条使用 `transform: scaleX(progress)`，不从左往右改 width。
- scroll 事件 passive，rAF 合并；页面隐藏或 `prefers-reduced-motion` 时直接设置状态，不做平滑动画。
- ScrollSpy 使用 IntersectionObserver 或 rAF 计算当前 heading，只改 `aria-current` 与 class。
- 目录点击使用默认锚点跳转；`scroll-margin-top` 覆盖 sticky header 与 safe-area。
- 站内内容交换后重算 heading 列表与进度基准，不移除 `<html>` 主题属性。

## 3.5 主题与多端验收

- 进度条/active 状态使用 accent 校正后的明暗变量。
- 深色下文字、边线、active 指示不失去对比度。
- 手机 landscape、平板分屏、桌面缩放 125%/150% 均不溢出。
- 焦点到达目录时可见；跳过链接优先级高于 TOC。

## 3.6 TDD

- 纯函数：是否启用 TOC、标题提取、slug 冲突、进度 clamp、当前 heading 选择。
- HTML：结构、嵌套层级、`data-pagefind-ignore`、无 JS 快照。
- jsdom：点击滚动、ScrollSpy 更新、内容交换重扫、resize 不重复 observer。
- 性能：长文档 200 个 heading 时初始化 < 16ms；滚动处理无长任务。
- 视觉：3 断点 × 明暗 × 短/长文。

---

## 4. BGM 播放列表与迷你控制面板

## 4.1 兼容配置

旧配置继续有效：

```yaml
bgm:
  enabled: true
  file: "assets/bgm.mp3"
  autoplay: true
  volume: 0.4
```

等价映射为一首自动生成标题的 track。新配置：

```yaml
bgm:
  enabled: true
  autoplay: true
  volume: 0.4
  resume: "state"       # none | state；默认 state，仅在用户曾手动播放时恢复
  show_panel: true
  tracks:
    - title: "Aria"
      artist: "Bach"
      src: "assets/audio/aria.mp3"
      cover: "assets/audio/aria.jpg"
    - title: "Goldberg Variations"
      artist: "Bach"
      src: "assets/audio/goldberg.mp3"
      cover: "assets/audio/goldberg.jpg"
```

规则：

- `tracks` 至少 1 首；`file` 与 `tracks` 同时存在时 `tracks` 优先并 warning。
- `src` 必须存在于 data/；标题缺省用文件名去扩展名。
- `volume` clamp 0–1；`autoplay` 不代表绕过浏览器策略。
- 单曲模式不渲染面板，仅保留现有按钮，保证零回归。
- `prefers-reduced-motion: reduce` 沿用现有规则：功能不启用、按钮隐藏、不自动播放。

## 4.2 UI 结构

- 顶栏 BGM 按钮保留为主开关；播放列表 > 1 时按钮 `aria-haspopup="dialog"`，点击播放/暂停，长按或面板按钮打开列表。
- 面板内容：
  - 当前标题/artist/cover；
  - 播放/暂停、上一首/下一首；
  - 音量 slider；
  - 曲目列表与当前曲 `aria-current`；
  - 关闭按钮。
- 面板 SSR 输出但 `hidden`；JS 不可用时完全不显示。
- 使用单个 `<audio transition:persist>`；切歌只更新 `src` 并按用户意图播放。
- 封面 `loading=lazy`、宽高固定，不参与首屏加载。

## 4.3 状态与播放策略

- localStorage 保存：
  - `volume`；
  - `trackIndex`；
  - 用户最近意图 play/pause；
  - 可选 `position`（仅同一曲目 60s 内恢复，避免刷新回到开头造成困惑）。
- 不保存自动播放成功与否；刷新后若上次意图为播放，仍需浏览器手势或既有可播放条件。
- `resume=none` 不保存 trackIndex/position，只保存音量。
- 曲目结束后播放下一首；最后一首循环回第一首。
- 与正文 `:::audio` 保持全局单播放：
  - 正文音频播放时 BGM 暂停并记为 “让位”；
  - 正文音频结束/暂停后，仅当 BGM 之前为播放状态时恢复；
  - 手动暂停任一播放器清除“让位恢复”。
- Media Session API 可用时输出标题/artist/cover，并支持上一首/下一首/暂停系统控制。
- 音频加载失败：面板显示错误状态并尝试下一首一次，避免循环重试。

## 4.4 多端与主题

- `>=769px`：面板从右上工具区下方展开，宽 320–380px。：面板从右上工具区下方展开，宽 320–380px。
- `<=768px`：底部 sheet，最大高度 70vh，可滚动；与右下联系卡冲突时，面板打开期间联系卡 `aria-hidden` 并临时隐藏；灯箱/搜索优先级高于面板。
- 所有控件高度 >= 44px；slider 触控宽度充足。
- 面板遮罩只在手机使用；深浅主题、accent、背景透明度均走变量。
- 播放列表长标题使用两行内省略，不跑马灯，避免持续动画。

## 4.5 秒开约束

- `<audio>` 与所有曲目 `preload=none`；未点击播放不请求音频字节。
- 面板封面在面板打开前不加载。
- 播放列表元数据内联在面板 HTML 中，不额外请求 JSON。
- 交互脚本只在存在 BGM 元素时初始化；无 BGM 页面零成本。
- 不引入音频可视化、Web Audio Analyser 或实时频谱。

## 4.6 TDD

- 配置归一化：旧/新 schema、缺文件、非法音量、空 tracks、file+tracks 冲突。
- 状态机：播放/暂停、切歌、结束、错误、让位恢复、resume none/state。
- jsdom：面板开关、键盘、音量、localStorage 受限、MediaSession 缺失。
- 回归：单曲 BGM 行为与现有测试完全兼容。
- 性能：未播放前网络请求数为 0；脚本初始化不监听全局 scroll。
- 视觉：手机 bottom sheet 与桌面 panel × 明暗主题；面板打开时联系卡/灯箱层级测试。

---

## 5. Admin / 编辑器集成

- 搜索：Admin 不管理索引；构建/预览按钮状态显示索引是否生成。
- OG：站点设置提供开关、模板、缓存、默认图；页面设置提供 `og_image/og_title/og_description` 上传与覆盖。
- TOC：页面设置提供 `toc/toc_depth/reading_progress`。
- BGM：配置表单支持从单曲迁移到 playlist，素材选择器可选择音频与封面；保存前做文件存在性校验。
- 所有新增 frontmatter/config 字段纳入 schema 校验、快照和 undo/redo 测试。

## 6. 实施顺序（TDD Milestones）

1. **M14a 搜索地基**：构建顺序、Pagefind 属性、索引排除与语言 filter 测试。
2. **M14b 搜索 UI**：快捷键、modal、键盘导航、语言 scope、手机 bottom sheet。
3. **M14c OG generator**：hash/cache/font subset 失败测试，再实现生成器与 meta 注入。
4. **M14d OG templates**：editorial/minimal/image 三模板与金样本。
5. **M14e TOC**：标题/锚点/布局测试，再实现 ScrollSpy 与进度条。
6. **M14f Playlist**：兼容配置与状态机测试，再实现 UI 与 Media Session。
7. **M14g Admin & CI**：表单、schema、构建校验、性能与双主题截图回归。

每步完成标准：先提交失败测试；实现后覆盖三端视口、明暗主题、无 JS/降级路径；更新 README 中功能列表与配置字段。

## 7. 非目标

- 不做服务端全文搜索、模糊拼音搜索、向量语义搜索。
- 不做运行时 OG 图 API。
- 不做评论、点赞、访问统计。
- 不做音频可视化、歌词滚动、电台流播放。
- 不为 TOC 提供 MiniMap 或 PDF 导出。


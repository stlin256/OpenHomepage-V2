# 极致秒开优化调研报告

日期：2026-08-29  
对象：OpenHomepage V2 当前工作区与 `dist/` 产物（2026-08-28 构建，真实 `data/` 内容）  
结论级别：只读调研；未修改生产代码与构建产物。`.scratch/` 中的测量脚本和实验产物不进入版本库。

## 1. 执行摘要

当前项目已经是静态直出架构，首屏 JS 只有 18.5 KB raw / 6.1 KB gzip，满足项目现有“首屏 JS <= 60 KB gzip”的软预算；GitHub/RSS 也在构建期固化，首屏没有业务 API 请求。因此，继续微调 JS bundle 不是秒开的主战场。

真正阻塞“1 秒内可见”的问题有四个：

1. Editorial 区块把磁贴、列表、归档卡图片写成 CSS `background-image`。CSS 背景图无法懒加载，优化器也只把它替换成原始宽度 WebP，导致 6 张下方位图在 `load` 前全量下载，约 1.51 MB。
2. `bgm.autoplay=true` 时 `<audio preload="auto">` 会预读 3.6 MB MP3。即使浏览器拦截自动播放，弱网下仍在 `load` 前读了约 283 KB。
3. `html.js .reveal { opacity: 0 }` 会把首屏内容全部隐藏，等待 18.9 KB 的 deferred module JS 加载后由 IntersectionObserver 加 `revealed`。这保证无 JS 可见，却让 JS 可用的弱网用户首屏 LCP 等待 JS。
4. 全站 67 KB CSS 外链包含 KaTeX 与 JetBrains Mono。首屏文本必须先等待这条 CSS 请求；在 150 ms RTT 弱网下会放大一个完整往返。

在可控产物实验中，仅移除 CSS 背景图预载与音频预读后，移动弱网 `load` 从 10.6 s / 2.17 MB 降到 2.3 s / 377 KB；再内联关键 CSS 并取消首屏 reveal 初始隐藏后，4x CPU + 1.6 Mbps 节流下 FCP/LCP 约 0.7-0.8 s。也就是说，在当前内容规模下“弱网 1 秒内可见”可达成，但应优先改加载策略，而不是先牺牲 GitHub 热力图、RSS 或杂志视觉效果。

## 2. 项目启动链路

### 2.1 构建与运行时

- `astro.config.mjs`：`output: 'static'`，自定义插件把 `data/assets` 复制到 `dist/assets`，并为 dev server 提供 `/assets` 中间件。
- `src/pages/[...slug].astro`：构建期读取 `data/pages`、`site.yaml`、`.cache/github.json`、`.cache/rss.json`，生成默认语言与多语言页面。
- `src/layouts/BaseLayout.astro`：输出主题和语言内联引导脚本、全站 CSS、BGM、联系方式卡、灯箱骨架，并加载统一交互入口。
- `src/scripts/interactions.ts`：统一入口负责 SPA 内容交换、主题、导航、动效、流式播放、BGM、热力图 tooltip、灯箱和页面预取。
- `scripts/optimize-images.ts`：构建后把普通 `<img>` 改为 AVIF/WebP 响应式 `<picture>`；但 CSS style 内的 `background-image` 只替换为同宽度 WebP，不生成响应式 AVIF。

### 2.2 当前产物规模

| 项目 | 当前值 |
|---|---:|
| 首页 HTML | 190.3 KB raw / 15.4 KB gzip / 11.2 KB brotli |
| 全站 CSS | 67.0 KB raw / 17.5 KB gzip |
| 首屏 JS | 18.5 KB raw / 6.1 KB gzip |
| JetBrains Mono latin variable | 40.4 KB |
| 首页实际选中的 hero AVIF | 52.6 KB |
| 背景音乐 MP3 | 3.51 MB |
| `dist/assets` 总量 | 27.45 MB / 277 个文件 |

首页 HTML 中 `main` 约 181 KB，其中 GitHub 区块 154 KB。进一步拆分发现：

- `style` 属性合计 99.2 KB；
- `data-tip` 合计 14.2 KB；
- Astro scoped attribute 合计 11.8 KB；
- `heat-cell` 376 个、`heat-week` 53 个。

这个 HTML 膨胀主要来自 `GithubBlock.astro` 的 `<style define:vars>`：同一组 heat 主题变量被重复内联到热力图的 400 多个后代节点。Raw HTML 会因此多出约 88 KB；不过重复字符串压缩率极高，当前首页 gzip 只少约 0.7 KB。它是 DOM/HTML 卫生问题，不是本次弱网秒开的第一瓶颈。

## 3. 实测结果

### 3.1 测量方法

- 本机 Playwright Chromium；
- 桌面 viewport 1366x900，移动 viewport 390x844、DPR 3；
- 弱网模型：150 ms RTT、1.6 Mbps down、750 Kbps up、4x CPU throttle；
- 原始自托管服务没有压缩文本资源；另一个实验服务打开 gzip，用于近似 GitHub Pages 的文本压缩收益；
- `load` 前字节数用 CDP `Network.dataReceived` 在 load 事件时截断统计；
- 视觉指标用 PerformanceObserver 采集 FCP/LCP/CLS。

### 3.2 当前基线

| 场景 | load | FCP | LCP | CLS | DOM nodes | 备注 |
|---|---:|---:|---:|---:|---:|---|
| 桌面冷缓存，本地无节流 | 257 ms | 176 ms | 672 ms | 0.023 | 913 | load 后 1 秒窗口内读取约 2.27 MB |
| 桌面热缓存，本地无节流 | 218 ms | 168 ms | 632 ms | 0.037 | 913 | 视觉时间稳定 |
| 移动冷缓存，本地无节流 | 197 ms | 148 ms | 604 ms | 0.085 | 913 | 首屏本体不大，问题在弱网排队 |
| 移动弱网 + 4x CPU | 10.6 s | 1.48-1.57 s | 4.77-4.80 s | 0.11-0.15 | 913-919 | load 前已接收 2.17 MB |

弱网 load 前最大请求：

| 资源 | 字节 |
|---|---:|
| `research-evaluation.webp` | 392 KB |
| `gallery-transit-station.webp` | 278 KB |
| `gallery-kingfisher.webp` | 245 KB |
| 首页 HTML | 195 KB |
| `gallery-shantou-university.webp` | 168 KB |
| `gallery-victoria-harbour-night.webp` | 156 KB |
| `gallery-travel-log.webp` | 140 KB |
| `bgm.mp3` | 283 KB（部分预读） |
| `research-compute.webp` | 129 KB |
| `hero.webp` | 108 KB（Editorial 磁贴背景，不是 `<picture>` 的 hero） |

load 后约 1 秒，空闲预取又开始拉 `/en/` HTML 和对应图片，总接收量继续增加约 0.2 MB 或更多。该策略对语言切换体验有效，但缺少时间、字节和并发预算。

## 4. 根因分析

### P0-1 Editorial 图片使用 CSS 背景并被优化成全宽 WebP

位置：

- `src/lib/editorial-block.ts:53`：列表 mask 使用 `background-image`；
- `src/lib/editorial-block.ts:76`：磁贴写入 `--tile-image`；
- `src/lib/editorial-block.ts:92`：归档卡媒体使用 `background-image`；
- `scripts/optimize-images.ts:155`、`scripts/optimize-images.ts:215`：style 内 URL 只做 WebP 替换。

问题不是图片优化档位不足，而是媒体类型选错：

- CSS 背景图会随样式匹配加载，不能像 `<img loading="lazy">` 一样延迟；
- style URL 只换成 `xxx.webp`，没有 `480/768/1024/1440` 响应式候选，也没有 AVIF；
- 多张图片位于首屏下方，却参与首页 load 事件，弱网下把真正的首屏 CSS/JS/字体排队时间拉长。

生产修复方向是把 Editorial 的三类媒体改成结构化 `<picture>` / `<img>`：

- AVIF `<source>` + WebP `<img>` fallback；
- `loading="lazy"`、`decoding="async"`；
- 明确宽高或 aspect-ratio；
- 保留现在的遮罩、渐变、hover 效果，把 `<img>` 放在底层并用 `object-fit: cover`。

这样不是删除视觉，而是让现有图片优化器真正接管这些图片。

### P0-2 BGM 自动播放语义导致音频参与首载

位置：`src/layouts/BaseLayout.astro:262`。

当前逻辑是：

```astro
preload={bgm.autoplay ? 'auto' : 'none'}
```

浏览器虽会因为 autoplay policy 阻止声音播放，但 `preload="auto"` 仍会请求媒体数据。示例/真实数据均配置 `autoplay: true`，音频文件 3.51 MB。

建议改为：

- HTML 永远 `preload="none"`；
- 首次用户交互后再 `audio.load()` 并按现有记忆状态播放；
- 如需保留 BGM，将 MP3 转为较低码率 AAC/Opus 或浏览器可用的双格式，目标 < 1 MB；
- BGM 图标可以先用静态渲染表示“可播放”，不必用音频字节换按钮状态。

### P0-3 首屏 reveal 等 JS 后才可见

位置：

- `src/styles/global.css:2099`：`html.js .reveal { opacity: 0; ... }`；
- `src/scripts/motion.ts:19`：IntersectionObserver 到位后加 `revealed`；
- `src/layouts/BaseLayout.astro:110`：同步内联脚本先加 `js` class。

这个设计保证无 JS 用户看到内容，但对绝大多数 JS 可用用户，首屏在 HTML/CSS 已可渲染时仍被人为隐藏，直到 module JS 下载执行。弱网实验中，内联 CSS 后 FCP 已到 504 ms，但 LCP 仍约 1.9 s，差值主要来自 reveal 等 JS。

建议：

- 首屏 / 初次可见内容默认可见；
- 只对明确位于视口外的区块做 scroll reveal；
- JS 启动后再给下方区块加“可动画”标记，避免 FOUC，同时保证 JS 加载失败时内容仍可见；
- `prefers-reduced-motion` 和移动端进一步降级。

### P1-1 全站 CSS 单文件与全站 KaTeX/Mono 加载

位置：`src/layouts/BaseLayout.astro:10-12`。

当前 67 KB CSS 由三部分组成：global 48 KB、KaTeX 24 KB、JetBrains Mono 2 KB CSS。gzip 后 17.5 KB，但对首屏文本来说是阻塞请求，弱网下多一个 RTT。

建议：

- 第一阶段：为首页生成内联 critical CSS，或拆出 layout/header/profile/editorial 首屏样式，非首屏样式异步加载；
- KaTeX CSS 只注入包含 `.katex` 的页面；
- JetBrains Mono 只在存在代码块或 mono 元素的页面加载；
- 保持主题内联脚本在 CSS 前，避免暗色模式闪烁；
- 对 mono 字体做按页面子集或用系统 mono 作为更积极 fallback。

注意：不要简单全量内联 67 KB 到每个多语言页面作为最终方案。实验证明它对首屏有效，但会造成每语言 HTML 都携带全部样式；最终应做“首屏 critical + 非关键异步”的拆分。

### P1-2 空闲预取没有预算和分层

位置：

- `src/scripts/tab-prefetch.ts:34`：idle timeout 3 秒；
- `src/scripts/tab-prefetch.ts:43`：逐个 `new Image()`；
- `src/lib/page-prefetch.ts:52`：只收集 `<img>`，没有读取 sibling `<source type="image/avif">`。

实测后果：

- 其他语言 HTML 约 190 KB raw；
- 预取图片走 WebP fallback，而不是页面实际渲染选择的 AVIF；
- load 后很快开始占用弱网带宽；
- 页面、图片串行但数量不受总字节限制。

建议：

- 首次 load 后至少延迟 3-5 秒，且要求页面 `visible`、无用户输入、网络非 slow-2g/2g；
- 设总预算，例如 500-750 KB，达到即停止；
- 同一时刻只预取 1 个 HTML 或 1 张图；
- 只预取当前语言导航页；备语言 HTML 延后或只在 hover/focus 语言菜单时预取；
- 图片候选必须包含 `<picture>` 的 AVIF source，或者直接用 `<link rel="prefetch" imagesrcset imagesizes>`；
- 用户发生点击/滚动抢资源时暂停队列。

### P1-3 流式打字机造成 CLS

位置：

- `src/lib/stream.ts:246`：初始播放容器为空；
- `src/scripts/stream-player.ts:54`：随 token 增长调整高度；
- `src/styles/global.css:2005-2008`：height transition。

CLS 源头显示 `stream-cursor` 和 stream 区块持续改变高度，推动 profile、notice、后续 editorial 区块，实验 CLS 约 0.105-0.116，略高于 0.1 的良好阈值。

建议在动画开始前预留最终内容高度：

1. 用 `noscript` 中的完整 HTML 创建离屏、同宽度、不可见测量节点；
2. 将 `.stream-content` 固定为最终高度，动画只在容器内部发生；
3. resize 或语言切换时重新测量；
4. cursor 使用绝对定位或独立动画层，避免每个 token 都生成 layout shift 记录。

另一个更保守方案是默认静态完整呈现，仅在用户点击 replay 时动画；这会牺牲当前自动播放效果。

### P1-4 热力图 HTML 变量重复

位置：`src/components/blocks/GithubBlock.astro:157` 的 `<style define:vars>`。

Astro 把 heat 变量写到组件大量后代节点，导致首页 raw HTML 增加。建议改为只在区块根节点写一个 `style`，让 CSS custom property 继承；动画 delay 可以改为 CSS `nth-child` 或父级 counter。该优化对 gzip 传输收益小，但能把 raw HTML 从约 190 KB 降到约 105 KB，减少解析和 SPA DOMParser 成本。

### P2-1 自托管服务缺少压缩与内容寻址缓存

位置：`scripts/serve.ts:58-65`、`scripts/serve.ts:93-101`。

当前自托管服务：

- `_astro/` 一年 immutable；
- HTML `no-cache`；
- 其他 `/assets/` 一小时；
- 没有 gzip/brotli 压缩。

这对本地静态服务是合理起点，但若用户真用 `npm run serve` 对公网提供站点，文本资源会多传 8-12 倍。建议：

- HTML/CSS/JS/SVG 支持 gzip，优先预压缩 `.gz` / `.br`；
- HTML 使用 `no-cache` + ETag/Last-Modified 304；
- 响应式图片产物使用内容 hash 文件名或指纹 query，才能长缓存；
- 反向代理下启用 HTTP/2/3；
- BGM/视频保持 Range 支持，但必须 `preload=none`。

GitHub Pages 会处理文本压缩，但项目仍应避免把优化寄希望于部署平台：图片和音频不会像文本一样被大幅压缩，当前 P0 问题在 Pages 上依然存在。

## 5. 可控实验

以下实验只修改 `.scratch/dist-*` 副本，未改源码：

| 实验 | 变化 | 移动弱网 + 4x CPU 结果 |
|---|---|---|
| A 当前基线 | 无 | load 10.6 s；FCP 1.5 s；LCP 4.8 s；load 前 2.17 MB |
| B 去掉 CSS 背景图与音频预读 | 视觉媒体暂时不加载，只验证上限 | load 2.3 s；FCP 1.57 s；LCP 2.84 s；load 前 377 KB |
| C B + gzip 文本压缩 | 近似 Pages 文本传输 | load 1.90 s；FCP 1.24 s；LCP 1.74 s |
| D C + 移除热力图重复变量 | raw HTML -88 KB，gzip 仅 -0.7 KB | load 1.89 s；FCP 1.25 s；LCP 1.74 s |
| E D + 内联关键 CSS | 少一个阻塞 CSS 往返 | load 1.46 s；FCP 0.50 s；LCP 1.92 s |
| F E + 首屏 reveal 默认可见 | 不等 JS 才显示 | load 1.41 s；FCP/LCP 0.72 s；复测 0.82 s |

解释：

- B 证明最大瓶颈是媒体加载决策；
- E 证明 CSS 请求是 FCP 的关键路径；
- F 证明 reveal 的初始隐藏是把 FCP 到 LCP 拉长的主要因素；
- D 说明 raw HTML 优化有价值，但对当前 gzip 网络传输不是第一优先级；
- F 的 CLS 仍约 0.11，需要单独预留 stream 最终高度。

生产实现不应沿用实验中“去掉背景图”的做法，而是替换为响应式懒加载图片，视觉保留。

## 6. 分阶段改造路线

### Phase 0：建立秒开护栏

目标：先让性能问题在 CI 中可见。

1. 定义目标预算：
   - 移动弱网 + 4x CPU：FCP < 1 s，LCP < 1.25 s，CLS < 0.1；
   - load 前首屏文本 gzip < 45 KB；
   - load 前媒体 < 150 KB（当前内容约 95 KB：AVIF 53 KB + mono 40 KB）；
   - load 前总接收 < 300 KB；
   - load 后 5 秒内空闲预取 < 750 KB。
2. 增加 Playwright 性能测试：冷缓存、热缓存、4x CPU + 1.6 Mbps、暗色模式、`prefers-reduced-motion`。
3. 对首页、features、gallery、research 分别输出资源瀑布断言。
4. 把测试纳入 `npm test` 或单独 `npm run test:performance`。

### Phase 1：P0 修复，目标 load 前 2.17 MB -> 400 KB 左右

1. Editorial 图片重构为 `<picture>/<img>`，交给现有 AVIF/WebP 后处理；
2. BGM 改为永远 `preload="none"`，首次交互后再加载；
3. 首屏 reveal 默认可见，仅下方区块滚动动画；
4. 首屏 critical CSS 内联，非关键 CSS/KaTeX/mono 异步或按页注入；
5. 补充视觉回归截图，确认磁贴、归档卡、列表 mask、hover、lightbox 不变。

预期：弱网 load 约 1.4-2.0 s，FCP/LCP 可进入 1 秒附近；如果 critical CSS 拆分理想，FCP/LCP 可低于 1 秒。

### Phase 2：交互质量与预算控制

1. stream 动画预留最终高度，目标 CLS < 0.1；
2. 空闲预取加 3-5 秒延迟、总字节预算、用户活动抢占；
3. 预取候选支持 AVIF source，避免“页面渲染 AVIF、预取却下载 WebP”；
4. 手动热力图变量继承，raw HTML 从 190 KB 降到 105 KB 左右；
5. 按页面条件加载 KaTeX 与 mono 字体；
6. 评估 Shiki 双主题 token 的 class/inline style 压缩，但这不是当前首屏瓶颈。

### Phase 3：部署与重复访问

1. 自托管服务增加 gzip/brotli 与 304；
2. `/assets` 响应式产物引入内容指纹并长缓存；
3. 公网建议置于 CDN 或反向代理之后，启用 HTTP/2/3；
4. 可选 Service Worker：
   - 只做 repeat visit 的静态 shell 和图片 stale-while-revalidate；
   - HTML 避免长时间强缓存，防止内容更新滞后；
   - 预算总量，不缓存 BGM/视频/full 原图；
   - 对多语言页面可做后台缓存，但必须与现有 SPA 缓存策略合并。
5. 可选 Speculation Rules / hover prerender，只针对导航链接，先确认多语言和 base path 行为。

## 7. 不建议优先做的事

- 继续压低 AVIF quality：当前页面实际选中的 hero AVIF 只有 52.6 KB，不是 10 秒 load 的主因。
- 删除 GitHub 热力图或 RSS：GitHub 区块 raw HTML 大但 gzip 小，业务价值高；先修变量重复和 tooltip 展示方式。
- 微调 18.9 KB JS：gzip 6.1 KB，远低于预算；真正问题是它 gate 了 reveal 可见性。
- 直接全量内联所有 CSS 作为最终方案：对单页实验有效，但会复制到每个语言和每个页面。
- 先做 Service Worker：不能解决冷缓存首访的 2 MB load，且会引入缓存失效复杂度。

## 8. 建议验收标准

| 指标 | 当前 | Phase 1 目标 | 极致目标 |
|---|---:|---:|---:|
| 弱网 load 前字节 | 2.17 MB | < 450 KB | < 300 KB |
| 弱网 FCP | 1.5 s | < 1 s | 0.5-0.8 s |
| 弱网 LCP | 4.8 s | < 1.5 s | < 1 s |
| CLS | 0.11-0.15 | < 0.1 | < 0.05 |
| 首页 raw HTML | 190 KB | < 160 KB | 100-120 KB |
| load 后 5 秒预取 | 未限制 | < 1 MB | < 750 KB |

当前自动化基线：`npm test` 通过，66 个测试文件、710 个测试。

## 9. 合并外部调研后的最终技术决策

本节合并三份附加调研中的 Speculation Rules、托管平台、Brotli/zstd、HTTP/2/3、缓存头结论，并按本项目代码结构重新筛选。筛选原则：只接受无体验降级、无闪烁、无老浏览器破坏、不增加运行时不确定性的方案。

### 9.1 Speculation Rules：采用 prefetch，暂不采用 prerender

外部调研将 `prefetch + prerender` 列为最高收益，这个判断适用于普通 MPA。但本项目不是普通整页跳转 MPA：`src/scripts/interactions.ts` 会拦截站内链接、执行 `preventDefault()`，再 fetch HTML 并替换 `<main>`。因此：

- Chromium 提前 prerender 的隐藏页面不会被正常激活；
- 点击后的自定义 `fetch()` 最多只能复用 prefetch 进入 HTTP cache 的 HTML；
- prerender 还会让隐藏页面执行 `interactions.ts`、语言引导、空闲预取等逻辑，增加副作用；
- 若为了 prerender 移除现有 SPA 拦截，会破坏 BGM 连续播放、header 监听保留和现有转场体验。

最终采用：

1. 生产页面注入 Chromium 可理解的 Speculation Rules **prefetch only**，`eagerness: moderate`；
2. 规则只匹配当前 base path 下的站内链接；
3. 现有 SPA 点击继续执行，`fetch()` 命中浏览器 prefetch cache，获得接近原方案的点击提速；
4. Firefox / Safari 不识别时无副作用，仍由现有页面缓存和空闲预取兜底；
5. 不启用 Astro `experimental.clientPrerender`，不启用手写 prerender，不加 ClientRouter。

这条方案与现有功能兼容，不需要降级任何体验。相反，直接照搬外部报告的 prerender 建议在本项目中收益不可靠。

新增兼容性实测：在 `.scratch/dist-spec` 注入 prefetch-only 规则并保留现有 SPA 拦截，Chromium 请求日志出现 `Sec-Purpose: prefetch`；随后点击仍走自定义 `fetch()`。无缓存控制时，prefetch 与自定义 fetch 是两次请求；HTML 返回 `public, max-age=600` 时，prefetch 后点击的自定义 `fetch` `transferSize=0`，确认复用。移动弱网 + 4x CPU 下，控制组点击导航 561-765 ms，prefetch 组 239-423 ms。`URLPattern({ pathname: '/*' })` 能匹配带项目 base 的路径。因此规则可以安全落地，但前提是 HTML 响应必须可缓存，不能是 `no-store`。

### 9.2 View Transitions 与 bfcache

- 跨文档 View Transitions 只作用于浏览器整页导航；本项目站内导航主要是自定义同文档内容交换，因此这两行 CSS 对主要导航路径没有收益。暂不加入，避免引入不可控过渡差异。
- 项目没有 `unload` / `pagehide` 监听，bfcache 条件良好。由于主要前进/后退路径已被 SPA `popstate` 处理，实际收益不如普通 MPA 明显；保留现状即可。
- Service Worker 不能解决首访冷缓存问题，只能作为后期回访优化。必须在 P0/P1 完成且图片 URL 有稳定指纹后再评估。

### 9.3 字体策略

外部报告建议 preload JetBrains Mono 或改 `font-display: optional`。结合本项目 LCP 归因，这两项不能直接照搬：

- 当前移动 LCP 元素是中文正文段落，使用系统字体，不是 JetBrains Mono；
- 首页代码块不在首屏，无条件 preload 40.4 KB mono 字体会挤占真正关键资源；
- `optional` 在慢网可能永久使用回退字体，造成视觉降级，不符合本项目约束；
- 保留 `swap`，只在“代码块/mono 文本确实是首屏 LCP”的页面上条件 preload；
- 如代码页出现字体换脸，用本地 mono fallback 的 `size-adjust` / ascent / descent 度量匹配，而不是改成 optional。

KaTeX 的 woff/ttf fallback 文件虽然增加部署体积，但删除会破坏只支持旧格式的浏览器。按照“不引入兼容性问题”的约束，首阶段不删除。

## 10. GitHub Actions / GitHub Pages 方案

### 10.1 平台边界

GitHub Pages 当前能力边界：

- 访客侧只有 gzip，不支持 Brotli / zstd；
- 不识别预压缩 sidecar 文件；
- 响应头固定 `Cache-Control: max-age=600`，不能给 `/_astro/` 配 immutable；
- 不支持 103 Early Hints；
- Actions 不能改变 Pages 的响应头和压缩格式。

因此，GitHub Actions 层的优化重点是产物内容、导航缓存利用、部署体积治理和性能回归门禁，而不是配置响应头。

### 10.2 Actions 产物优化

按顺序落地：

1. **P0 编码修复进入构建**：Editorial 图片改为响应式懒加载 `<img>/<picture>`；BGM `preload="none"`；首屏 reveal 默认可见；stream 容器预留最终高度。
2. **Speculation Rules prefetch**：在 BaseLayout 生产模式注入；只包含 `prefetch`，不包含 `prerender`；`eagerness` 使用 `moderate`，由 hover / pointerdown 触发；`OH_EDIT` / dev 模式不注入。
3. **空闲预取重写**：load 后延迟 3-5 秒；只在页面 visible、无用户活动、网络条件允许时启动；总预算 500-750 KB；当前语言 tab 优先，备语言等 hover prefetch；图片预取必须选择 AVIF source，或先移除图片 idle prefetch，仅保留 HTML。
4. **安全 CSS 方案**：第一阶段保留外链 CSS，避免 FOUC 风险；第二阶段用实验证明过的方式整包内联 CSS（不是临界 CSS 猜测提取），因为整包内联不改变样式匹配顺序，无 FOUC；用真实页面截图对比后再默认启用；不使用 `media="print" onload` hack，不使用维护状态不明的 critical CSS 工具。
5. **CI 性能门禁**：新增 Playwright 性能脚本，跑冷缓存与移动弱网；断言 load 前字节、FCP/LCP/CLS、CSS 背景图本地 URL、音频 preload、首屏 reveal 可见性；保留现有 710 个测试，并补充 Editorial 视觉截图。

整包内联 CSS 的取舍：首次访问少一个 CSS RTT，实验 FCP 从约 1.24 s 降至 0.50 s；代价是每个 HTML gzip 体积增加约 15-18 KB。对 GitHub Pages 固定 600 秒缓存和本项目多语言 HTML 预取来说，这个取舍值得实测后默认开启，但必须由性能测试决策，而不是直接照搬工具。

补充核实：

- 线上 GitHub Pages HTML 实测返回 `Content-Encoding: gzip`，`Cache-Control: max-age=600`；请求 `Accept-Encoding: br` 时返回未压缩 197,645 B，确认不支持 Brotli。
- 线上哈希 CSS 同样是 gzip，18,298 B，`Cache-Control: max-age=600`。
- 线上 HTML 和哈希 CSS 使用相同 ETag 时都能返回 304，说明 `max-age=600` 过期后的重验证仍有价值，但没有 immutable。
- 线上 AVIF 图片同样是 `max-age=600`，没有长缓存优势。

### 10.3 gh-pages 快照治理

当前 workflow 在构建后执行 `cd data && zip -qr ../dist/data-snapshot.zip .`，然后随 `dist/` 一起发布到公开 `gh-pages`。这有两个问题：

1. 真实 `data/` 内容和媒体可能被公开下载，与“真实 data 不入版本库”的隐私目标冲突；
2. 即使内容不变，zip 时间戳也可能让每次定时部署生成新 blob；每 8 小时一次会让 gh-pages 历史和仓库体积持续膨胀，最终拖慢 CI checkout 并接近 Pages 1 GB 站点上限。

建议改造为：

- `data-snapshot.zip` 永远不放入 `dist/`；
- 构建成功后上传为私有 Actions artifact 或 cache，设置 7-14 天保留期；
- 下次在线数据源失败时，先恢复最近的私有 artifact/cache，再进入现有 snapshot fallback；
- artifact 查找失败时保留现有明确失败与邮件提醒行为；
- 公开 Pages 只保留站点运行所需文件。

这属于部署层修复，不改变访客 UI，但能控制仓库膨胀并消除数据暴露风险。

### 10.4 Pages 后期回访优化

如果 Phase 1/2 完成后仍要进一步压缩回访时间，可以评估一个小型 Service Worker：

- 仅生产注册，dev / admin / `OH_EDIT` 全部排除；
- HTML network-first：在线时始终请求网络，离线或 5xx 才用 cache，避免内容长期滞后；
- 只 cache 内容寻址资产，不 cache HTML、BGM、视频、`-full` 原图和 data snapshot；
- 每次激活清理旧版本 cache；
- 不 precache 全站，只按访问追加；
- 与现有 SPA fetch、Speculation prefetch、base path 一起做集成测试。

在图片 URL 仍为 `hero.480.avif` 这类稳定名称前，不应启用 SW cache-first。否则同名图片内容更新后可能被旧 cache 卡住。

### 10.5 Editorial 图片替换实测

在 `.scratch/dist-editorial-img` 上把 6 张 CSS 背景图替换为真实 `<img>`，保留灰度、hover 与布局效果，并交给现有 AVIF/WebP 优化产物：

| 方案 | 移动弱网 load | FCP | LCP | CLS | load 前 |
|---|---:|---:|---:|---:|---:|
| 当前 CSS 背景图 | 10.6 s | 1.5-1.8 s | 4.8 s | 0.10-0.15 | 2.17 MB |
| Editorial `<img>` + BGM none + reveal 可见 + critical CSS + stream 预留 | 2.2-2.9 s | 0.74-0.95 s | 0.74-0.95 s | 0.099 | 0.58-0.64 MB |

自托管同产物 + Brotli sidecar + `Cache-Control: max-age=600` 复测：load 2.7 s，FCP/LCP 788 ms，CLS 0.0994，load 前 638 KB。

视觉对比结果：

- `prefers-reduced-motion` 下 Editorial hover mask 不可见，因此截图对比为 0 差异，这不能作为验收依据；
- 改用正常 motion、滚动触发并强制 mask 可见后，移动端差异 0.826%，桌面差异 1.853%。差异集中在 Editorial 列表 hover mask：替换层使用 AVIF 且亮度/灰度状态与原背景图仍有细微差。
- 磁贴和归档卡在页面截图中视觉保持稳定。生产落地仍需 hover / focus / 明暗 / 多语言四组截图，并允许只微调 filter 或 `object-position`，不允许改变布局。

这个结果比此前“移除背景图”的上限实验更可信：图片仍然加载，只是从全宽 WebP CSS 背景变成懒加载响应式 AVIF。当前实验 `sizes` 偏大，生产实现应按布局精确设置，预计还能再省 20-40 KB。

## 11. 自托管方案

### 11.1 项目内 Node 静态服务优化

当前 `npm run serve` 已经有目录索引、防穿越、Range 和基础缓存头，但有四个性能缺口：

1. 所有非 Range 响应 `readFileSync` 后整文件驻留内存；
2. 无 gzip / Brotli；
3. HTML 只有 `no-cache`，没有 ETag / Last-Modified 304；
4. `/assets/` 响应式图片没有内容指纹，却只缓存 1 小时，无法安全长缓存。

建议按无兼容风险顺序实现：

1. **预压缩构建**：新增 `scripts/precompress.ts`，只处理 HTML/CSS/JS/SVG/JSON/text，生成 `.br` 与 `.gz` sidecar；Node 内置 zlib 即可完成，不新增依赖；图片、音频、视频、woff/woff2 不压缩；该步骤只在 self-host 构建启用，产物不发布到 GitHub Pages。
2. **服务预压缩文件**：根据 `Accept-Encoding` 优先 `.br`，再 `.gz`，最后 identity；返回正确 `Content-Encoding` 与 `Vary: Accept-Encoding`；禁止把 `.br/.gz` 当普通文件直接列出或下载；Range 请求始终服务原文件；HEAD 不读完整 body。
3. **流式响应**：非 Range 200/304 使用 `createReadStream`；预压缩文件同样流式输出；保持媒体 Range 逻辑。
4. **条件请求**：为文件生成稳定强 ETag；HTML `Cache-Control: no-cache` + `ETag`；支持 `If-None-Match`，可选 `If-Modified-Since`；304 不返回 body。
5. **缓存分层**：`/_astro/*` 一年 immutable；构建期将响应式图片写入内容寻址路径，例如 `/_astro/images/<name>-<hash>.480.avif`，再由 HTML 引用；未指纹的 `/assets/*` 原图短缓存或重验证；HTML 直连时 `no-cache` + ETag。
6. **CDN 模式**：有共享缓存时 HTML 使用 `public, max-age=0, s-maxage=3600, stale-while-revalidate=86400, stale-if-error=86400`；浏览器仍重验证，CDN 可缓存并后台刷新；RSS 每 8 小时更新，1 小时共享缓存上限可接受；压缩响应必须带 `Vary: Accept-Encoding`。
7. **低内存设备**：请求期动态压缩和整文件 `readFileSync` 都应避免；构建期预压缩 + 流式发送更适合低功耗、小内存机器。

预压缩实测：对 23 个文本文件，Node 内置 gzip/Brotli 得到 1,850.4 KB raw -> 206.9 KB gzip -> 158.2 KB Brotli。首页 HTML 190.3 KB -> 15.4 KB gzip -> 11.2 KB Brotli；CSS 67.0 KB -> 17.5 KB gzip -> 15.4 KB Brotli；JS 18.5 KB -> 6.1 KB gzip -> 5.4 KB Brotli。`.br/.gz` sidecar 是纯产物，不改变 URL。

自托管组合产物实测（Editorial `<img>` + BGM none + reveal 可见 + critical CSS + stream 预留，Brotli sidecar，`Cache-Control: max-age=600`）：移动弱网 + 4x CPU 下 load 2.7 s，FCP/LCP 788 ms，CLS 0.0994，load 前 638 KB。这说明自托管在编码层与 Pages 可以共用同一组 P0 修复；差异主要在响应头与预压缩。

### 11.2 TLS、HTTP/2 与 HTTP/3

- Node 当前服务可作为本地 / 内网服务，也可作为反代后的 origin；
- 生产公网 HTTPS 更推荐 Nginx / Caddy 终结 TLS：证书续期、OCSP stapling、HSTS、HTTP/2 与日志都更成熟；
- Node HTTP/2 可以作为 `serve.http2: true` 的可选项实现，默认保持 HTTP/1.1，避免改变本地调试行为；
- Node 标准库没有生产级 HTTP/3，不应为此引入实验依赖；
- 中国大陆访客为主时，HTTP/3 / QUIC 可能遇到 UDP QoS。必须保留高质量 HTTP/2 兜底，并通过多网络晚高峰实测后再启用；
- TLS 保持 1.2 + 1.3，不做 TLS 1.3-only，避免旧 Android / 内置浏览器兼容性回退。

### 11.3 Nginx / Caddy 配套策略

项目侧负责生成正确产物与 sidecar，服务器侧只做稳定分发：

- Nginx：`gzip_static on`、`brotli_static on`、`sendfile`、`open_file_cache`；
- Caddy：`file_server { precompressed br gzip }`；
- `/_astro/` 一年 immutable；
- HTML no-cache + ETag；
- 未指纹 `/assets/` 短缓存或重验证；
- HTTP/2 开启；HTTP/3 仅在实测稳定后开启；
- 不建议开启 TLS early data / 0-RTT；静态站收益小，且存在重放语义风险。

### 11.4 不做的自托管事项

- 不对 AVIF/WebP/MP3/woff2 再做 gzip 或 Brotli：这些格式已压缩，浪费 CPU 且无收益；
- 不在 Node 里实现实验性 HTTP/3；
- 不用动态 Brotli 高等级压缩处理每个请求；
- 不给未指纹的 `/assets/` 一年 immutable；
- 不引入跨文档 View Transitions 或 prerender 来替代现有 SPA，以免破坏 BGM 连续播放与现有转场。

## 12. 最终实施顺序

### 第一批：冷启动秒开与稳定性

1. Editorial 三类 CSS 背景图改为 `<img>`，由现有 AVIF/WebP 优化器接管；
2. BGM 永远 `preload="none"`，首次交互后再 load；
3. 首屏 reveal 默认可见；只对视口外内容启用滚动动画；
4. stream 动画预留最终高度，CLS 降到 0.1 以下；
5. 修复热力图重复 heat vars；
6. 增加性能与视觉回归测试。

预期：弱网 load 前从 2.17 MB 降到 600 KB 左右，FCP/LCP 约 0.8-1 s，CLS 约 0.10 或更低。

### 第二批：导航与 CSS

1. 注入 Speculation Rules prefetch-only；
2. 重写 idle prefetch 的延迟、预算和 AVIF 候选逻辑；
3. 实测整包内联 CSS，若弱网收益保持且视觉无差异，则默认启用；
4. 保持 `swap` 字体策略，只做条件 preload 与 fallback 度量匹配。

预期：GitHub Pages 弱网 FCP/LCP 可稳定低于 1 s；站内点击因 prefetch cache 明显提前完成。

### 第三批：部署治理

1. 把 data snapshot 移出公开 gh-pages，改用私有 artifact/cache；
2. self-host 构建增加 `.br/.gz` 预压缩；
3. Node serve 增加流式输出、条件请求、压缩协商；
4. 响应式图片改为内容寻址 URL 并长缓存。

### 第四批：可选回访增强

1. 在 GitHub Pages 上评估小型 Service Worker；
2. 在自托管 / CDN 场景启用 HTML `s-maxage + stale-while-revalidate`；
3. 多网络实测后再决定 HTTP/3；
4. 所有更新语义必须有自动化测试，不允许出现旧 HTML 配新资产或新 HTML 配旧图片。

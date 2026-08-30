# 秒开治理第二轮调研报告（2026-08-30）

> 范围：只调查，不改产品代码。所有实验均只修改临时 `dist/` 产物并在测量后恢复。
> 约束：不能改变用户体验、组件表现、无 JS 降级与动画语义。

## 1. 结论摘要

上一轮秒开治理的核心修复仍然生效：

- Editorial 媒体已经不是 CSS 背景图，产物中没有会提前加载的本地 `url(/assets/...)` 背景图。
- 16 个页面的 BGM `<audio>` 均为 `preload="none"`，未点击/未尝试播放前没有请求 `bgm.mp3`。
- 滚动显现默认可见，只给视口外元素追加 `reveal-pending`。
- AVIF / WebP 响应式管线、Speculation Rules prefetch-only、GitHub 热力图变量收敛都在。
- 首页/研究页/相册页加载阶段没有 >50ms 的 Long Task；Features 有一次 78ms Long Task，且发生在 FCP 之后。

新增功能之后，新的主要瓶颈排序如下：

1. **单一阻塞 CSS 请求 + 全站 CSS 过大**：`global.css` 100.6 KB raw / 23.0 KB gzip，单路由首屏实际使用只有 11.6–43.0 KB。可控实验中去掉该阻塞请求后，移动弱网 FCP 从 1.27–1.55s 降到 0.57–0.81s。
2. **响应式图片候选过宽**：移动端大量 120–326px 的图片实际加载 1024px AVIF；固定 48px 的 BGM 封面加载 512px。把移动端候选封到 768px 后，首页子资源从 504 KB 降到 362 KB，`load` 从约 3.7–4.0s 降到约 3.0s。
3. **字体按整包加载**：首页为了 3 个数字加载 39.5 KB JetBrains Mono Variable；Features 页字体合计 86.6 KB；Research 页 KaTeX 字体 41.8 KB。
4. **空闲预取没有预算和用户意图约束**：load 后立即预取所有语言页、同语言 tab、响应式图与灯箱原图。桌面高带宽下 8 秒内出现过额外 4.8 MB 传输。
5. **首页移动端 CLS 0.162**：主要来自流式打字机与通知横幅的**有意布局动画**。之前“预留完整内容高度”的方案已被 revert；在不改变当前视觉表现的前提下没有找到安全修复。
6. **HTML/DOM 变重**：首页 114.7 KB raw / 1019 DOM，其中 GitHub 热力图约 62.9 KB；Features 149 KB raw / 1644 DOM，主要是 Shiki 高亮标记。

如果采用保守、带视觉验收的组合方案（critical CSS + 按布局上限裁剪图片候选），本地移动弱网实验已能达到：

- FCP 0.49–0.84s；
- `load` 2.52–2.69s；
- 首页子资源 338 KB。

这说明“移动弱网 + 4x CPU 冷缓存下 FCP < 1s”仍然可达，但必须逐项做视觉回归，不能直接把实验参数当作最终参数。

---

## 2. 测量方法

### 2.1 构建产物

执行：

```bash
npm run build
```

结果：

- 16 个静态页面；
- `dist/` 共 599 个文件，约 33.56 MB；
- 图片优化：49 个 WebP 转换、165 个响应式 WebP；50 个 AVIF 转换、165 个响应式 AVIF；
- 构建时有一个远程 YouTube 封面下载失败，保留远程 URL。

### 2.2 浏览器环境

Playwright Chromium：

- 移动：390×844，DPR 2，4x CPU throttle；
- 网络：1.6 Mbps down / 750 Kbps up / 150ms latency；
- 冷缓存：`Network.setCacheDisabled`；
- 等待：`load` 后再观察 5–10s；
- 指标：Performance API / PerformanceObserver；
- 文本压缩：本地静态服务输出 gzip（level 6），近似 GitHub Pages 的文本压缩；本地服务为 HTTP/1.1，绝对值不能等同线上 Pages/HTTP2。

桌面参考：1440×900，1x CPU，10 Mbps，40ms latency。

### 2.3 口径说明

文中“子资源传输量”来自 `performance.getEntriesByType('resource')`，**不包含导航 HTML 自身**。讨论完整首访字节时应另加 HTML。

---

## 3. 当前基线

### 3.1 移动弱网冷缓存

| 路由 | 子资源 | 请求数 | FCP | LCP | load | DOM | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/` | 504 KB | 14 | 1.27–1.55s | 1.27–1.55s | 3.71–3.97s | 1019 | load 后 0.108；5s 后 0.162 |
| `/research` | 97 KB | 6 | 1.01–1.04s | 1.01–1.04s | 1.46–1.49s | 261 | 0 |
| `/features` | 229 KB | 12 | 1.90–1.99s | 1.90–1.99s | 3.64–3.72s | 1644 | 0.001 |
| `/gallery` | 705 KB | 17 | 0.91–0.93s | 1.39s | 4.27–4.32s | 255 | 0 |

首页语言版本的 `/en/` 与中文首页几乎一致。

### 3.2 桌面参考

首页：

- FCP：0.31–0.48s；
- LCP：0.54–0.61s；
- `load`：0.83–1.10s；
- CLS：约 0.042。

桌面 LCP 元素是 Editorial 的 `research-compute` 图片。

### 3.3 主要文本资产

| 资产 | raw | gzip | Brotli |
|---|---:|---:|---:|
| 首页 HTML | 114.7 KB | 16.7 KB | 12.5 KB |
| 全站 CSS | 100.6 KB | 23.0 KB | 20.0 KB |
| 前端 JS bundle | 45.3 KB | 14.0 KB | 12.5 KB |
| 全站搜索索引 | 37.3 KB | 12.3 KB | 10.1 KB |

字体为二进制，gzip/Brotli 基本无收益：

| 字体 | 大小 |
|---|---:|
| JetBrains Mono Variable（latin） | 39.5 KB |
| KaTeX Main Regular | 25.7 KB |
| KaTeX Math Italic | 16.1 KB |
| KaTeX Size1 | 5.3 KB |

---

## 4. 高收益优化点

## 4.1 P0-A：critical CSS / 路由级 CSS 拆分

### 证据

Chrome CSS coverage：

| 路由 | 首屏使用 | CSS 总量 | 使用率 |
|---|---:|---:|---:|
| `/` | 26.1 KB | 100.6 KB | 25.9% |
| `/research` | 13.1 KB | 100.6 KB | 13.0% |
| `/features` | 43.0 KB | 102.8 KB | 41.8% |
| `/gallery` | 11.6 KB | 100.6 KB | 11.5% |

当前所有页面共享一个阻塞 CSS。新加入的 BGM drawer、搜索、TOC、媒体、表格、动画等样式都进入同一 bundle，导致低内容路由也要下载并解析全站 CSS。

### 可控实验

将首页完整 CSS 内联，只用于验证“去掉阻塞 CSS 请求”的上限（不是生产建议）：

| 方案 | FCP | load |
|---|---:|---:|
| baseline | 1.272 / 1.476 / 1.548s | 3.711 / 3.910 / 3.969s |
| full CSS inline | 0.780 / 0.568 / 0.808s | 3.287 / 3.266 / 3.305s |

### 生产方向

不建议把 100 KB CSS 全部内联到每个页面：SPA 导航会反复下载并 DOMParser 这些内联样式，语言页/预取页 HTML 也会膨胀。

建议采用：

1. **每路由 critical CSS**：
   - 只内联首屏 shell + 当前路由首屏所需规则；
   - 包含主题变量、深色模式首屏状态、header、notice、profile/stream 等首屏组件；
   - 目标 raw 10–25 KB，gzip 约 3–6 KB。
2. **完整 CSS 非阻塞加载**：
   - `rel=preload` + `onload` 或 route CSS chunk；
   - 在 SPA swap / 组件初始化前确保完整 CSS 已可用，避免新路由出现无样式瞬间。
3. **不要为语言页重复内联同一大段 CSS**：
   - 预取 HTML 应保持小体积；
   - 语言切换的共享 CSS 应继续利用浏览器缓存。
4. **视觉验收**：
   - zh/en/ja/fr；
   - light/dark；
   - mobile/desktop；
   - hover/open/动画中态；
   - `prefers-reduced-motion`。

### 风险

critical CSS 提取遗漏会造成 FOUC 或交互样式晚到。收益最大，但必须由截图与状态覆盖测试保护。

---

## 4.2 P0-B：按布局尺寸裁剪响应式图片候选

### 当前问题

`RESPONSIVE_WEBP_WIDTHS` 固定为：

```ts
[480, 768, 1024, 1440, 1920, 2560]
```

HTML 会暴露所有小于原图的候选。移动端实际渲染尺寸与下载候选对比：

| 组件 | 实际显示宽度 | 实际下载 |
|---|---:|---:|
| BGM 封面 | 48px | 512px（约 10.7x） |
| Editorial tile | 157px | 1024px（约 6.5x） |
| Archive media | 120px | 1024px（约 8.5x） |
| 主图 | 326px | 1024px（约 3.1x） |
| Editorial mask | 235–258px | 1024px（约 4.0–4.4x） |

这不是 AVIF 优化器失效，而是“所有候选都暴露 + Chromium 高 DPI 选择策略”共同造成的结果。对固定小图，480px 起步也过宽。

相册页更明显：11 张 326px 的图片在初始加载阶段全部下载 1024px AVIF，例如：

- `gallery-iron-sparks.1024.avif`：101 KB；
- `gallery-yingge-dance.1024.avif`：70 KB；
- `gallery-kingfisher.1024.avif`：63 KB；
- `gallery-transit-station.1024.avif`：62 KB。

### 可控实验

把移动端候选封到 768px：

| 方案 | 首页子资源 | load |
|---|---:|---:|
| baseline | 504 KB | 3.711 / 3.710 / 3.969s |
| cap 768 | 362 KB | 3.050 / 3.016 / 3.044s |

节省：

- 子资源 -142 KB（-28.2%）；
- `load` 约 -0.7 到 -0.9s；
- FCP 基本不变，因为这些图片在 FCP 后才请求。

与 full CSS inline 组合：

| 方案 | FCP | load | 子资源 |
|---|---:|---:|---:|
| baseline | 1.27–1.55s | 3.71–3.97s | 504 KB |
| CSS inline + cap 768 | 0.49–0.84s | 2.52–2.69s | 338 KB |

### 重要视觉风险

768px 对 326px 显示宽度约 2.35x，在 DPR2 下通常足够，但**不能直接宣称无视觉变化**。截图像素实验显示：

- mean diff 1.34/255；
- 7.6% 像素差 >8；
- 2.7% 像素差 >32。

这不足以证明“用户不可感知”。若严格遵守“零视觉变化”，应采用更保守的 3x 上限，例如 960/1024px，虽然收益会小于 768px 实验。

### 生产方向

1. 从 `sizes` 推导每个断点的最大 CSS 尺寸。
2. 只暴露不超过 `max_css_size × 目标DPR` 的候选：
   - 保守目标：3x；
   - 激进目标：2.25–2.5x，必须有人工/SSIM 验收。
3. 若 `sizes` 含媒体条件，生成多个 `<source media=...>`，让移动端和桌面端各自拥有独立候选集，避免移动端被桌面候选“拉高”。
4. 固定尺寸图片生成 1x/2x/3x：
   - 48px：48/96/144；
   - 76.8/88px：约 77/154/231 与 88/176/264；
   - 120px：120/240/360。
5. BGM/RSS/publication 小图不要从 480px 起步。
6. 原图和 `-full` 仍保留给灯箱，不参与页面 `srcset`。
7. AVIF source 和 WebP fallback 必须同步裁剪，避免支持差异导致不同体积。
8. 每个改动用截图对比和 DPR1/2/3 实测保护。

---

## 4.3 P0-C：字体子集化

### 当前使用情况

| 路由 | 初始字体 | 体积 |
|---|---|---:|
| `/` | JetBrains Mono Variable | 39.5 KB |
| `/gallery` | JetBrains Mono Variable | 39.5 KB |
| `/research` | KaTeX Main + Math Italic | 41.8 KB |
| `/features` | Mono + 3 个 KaTeX 字体 | 86.6 KB |

首页中实际触发 Mono 的可见元素只有 Editorial 序号 `02 / 03 / 04`。相册页只有一个小 `code`。为极少量字符下载完整 variable font 明显过重。

### 生产方向

1. **JetBrains Mono 拆分**：
   - 数字/基础 ASCII 子集用于 `.editorial-item-index`；
   - 完整代码字体只在页面存在 `code/pre/kbd/samp` 时下载；
   - 用同一字体源生成子集，保持字重与字形不变；
   - 可用 `unicode-range` 让浏览器按字符选择子集或完整字体。
2. **KaTeX 按页面/语言子集**：
   - 构建期收集每页实际数学字符；
   - 生成 route-specific union subset；
   - 不改变 KaTeX CSS 的 font-family 与 fallback。
3. **不要改成 `font-display: optional`**：
   - 会改变慢网下最终字体显示概率；
   - 当前 `swap` 更符合“不改表现”。
4. 只对确认为 LCP/首屏关键字体做 preload；Mono 与 KaTeX 大多在下方内容，无条件 preload 会抢占更关键资源。

### 预期收益

可以显著降低 `load` 和网络竞争，但对 FCP 的直接收益小于 critical CSS，因为正文主要使用系统 sans 字体，字体策略是 swap。

---

## 4.4 P1-D：空闲预取加预算与用户意图约束

### 当前行为

`scheduleTabPrefetch()` 在 `load` 后立即通过 `requestIdleCallback` 启动，且：

- 没有整体字节预算；
- 没有等待用户停止活动；
- 没有检查 `effectiveType === '3g'`，只排除 `slow-2g/2g`；
- 预取所有语言页、同语言 tab；
- 接着预取这些页面的响应式图片；
- 最后预取灯箱 `-full`/原图。

实测：

- 桌面高带宽一次 8 秒内额外传输约 4.8 MB；
- 首页移动弱网 5 秒后子资源从 504 KB 增至 635 KB；
- Research 页 5 秒后从 97 KB 增至 350 KB；
- Gallery 页 5 秒后从 705 KB 增至 870 KB。

这不影响冷缓存 FCP，但会消耗流量、电量，并可能与用户真实导航竞争网络。

### 生产方向

保持“语言/点击近乎瞬时”的体验，但加护栏：

1. load 后延迟 3–5s；
2. 仅 `document.visibilityState === 'visible'`；
3. 最近 1–2s 无 click/scroll/keydown；
4. `saveData=false` 且 `effectiveType` 至少 `3g`/`4g`（按预算阈值定义）；
5. 每会话预算 500–750 KB；
6. 优先级：
   - 当前语言 tab；
   - 用户 hover/pointerdown 的语言；
   - 备语言 HTML；
   - 低成本响应式图。
7. 灯箱原图/`-full` 只在：
   - 用户打开过灯箱；
   - hover/focus 图片；
   - 或预算充裕且用户明确停留时预取。
8. 用户开始交互或网络变化时 abort 后续队列。
9. 性能测试断言：无交互 10s 内空闲预取不超过预算，且没有 `-full` 请求。

---

## 4.5 P1-E：CLS 是有意动画，不能无损“修指标”

### 证据

首页移动端：

- `load` 时 CLS 0.108；
- 5s 后 0.162。

LayoutShift 来源主要是：

- `block-streaming` 内容逐 token 增长；
- profile 与后续 editorial 被推动；
- `notice-banner` 展开贡献约 0.017；
- `stream-cursor` 自身贡献很小。

主要来源不是图片缺宽高，也不是字体 swap。

### 历史事实

提交 `95c8b8c` 曾尝试播放前离屏测量完整内容高度并预留；提交 `d665dcf` 已 revert。原因可以理解为该方案会改变当前流式动画的视觉表现：内容出现前先留下空白区域，后续区块不再逐步移动。

### 结论

在“不能改变用户体验和组件表现”的硬约束下，**没有找到安全修复方案**。可选方案都会改变至少一种当前表现：

- 预留最终高度：初始布局不同；
- 固定高度裁剪：内容出现方式不同；
- 延迟动画：出现时间不同；
- 去掉高度过渡：动画节奏不同；
- 通知横幅改 transform 且预留空间：首屏布局不同。

建议将 CLS 标记为“有意动画导致的指标冲突”，除非用户明确允许调整流式/横幅动画，否则不作为本轮无损优化项。

---

## 5. 中低收益优化点

## 5.1 JS bundle 拆分

当前：

- raw 45.3 KB；
- gzip 14.0 KB；
- 首页/Research/Gallery 无 >50ms Long Task；
- Features 有一次 78ms Long Task，且在 FCP 后。

JS 不是当前 FCP 的第一瓶颈。若继续治理，可考虑：

- core：导航、theme、motion、language、page cache；
- 按需：search、BGM、TOC、audio、heatmap、stream、lightbox；
- 初始化前检测 DOM，只 import 存在的组件；
- 在 idle 预取动态 chunk，保证首次点击前可用。

必须保证 BGM 连续播放、搜索快捷键、语言菜单、灯箱和 TOC 的首击响应不退化。

## 5.2 HTML / DOM 减量

首页：

- HTML 114.7 KB raw / 16.7 KB gzip；
- DOM 1019；
- GitHub heatmap 片段约 62.9 KB；
- `heat-cell` 相关序列化约 48 KB。

Features：

- HTML 149 KB raw / 25.5 KB gzip；
- DOM 1644，主要来自 Shiki token span。

可选方向：

1. 热力图 tooltip 文本从每个 `data-tip` 改为紧凑索引/JSON，由事件委托读取；
2. 减少重复 class，改由父级结构选择器；
3. Shiki 使用 CSS class / CSS variables 输出，减少 inline style；
4. 对长代码块使用 `content-visibility: auto` + 精确 `contain-intrinsic-size`。

这些都主要改善解析与 SPA DOMParser，网络收益较小，且必须保留无 JS、tooltip、复制和高亮语义。

## 5.3 Features 页视频 poster

`feature-flower-poster.webp`（24 KB）在 HTML 解析阶段就请求，早于 CSS/JS 完成加载。如果该视频在首屏外，可以考虑：

- JS 可用时使用 lazy poster/facade；
- 无 JS 时保留原生 poster；
- 保持 controls、duration、播放行为不变。

需要特别小心：`<video poster>` 本身没有 `loading=lazy`，且不能为了秒开牺牲媒体组件表现。

## 5.4 搜索索引拆分

`search-index.json`：

- raw 37.3 KB；
- gzip 12.3 KB。

默认“当前语言”搜索可以只加载语言分片；点击“全部语言”时再加载全站索引。搜索不是首屏资源，因此收益只影响打开搜索的速度，不改变结果。

## 5.5 远程 RSS/YouTube 封面本地化

构建日志显示 YouTube 封面下载失败并保留远程 URL，空闲预取还会请求远程 `hqdefault.jpg` 与 `-full.jpg`。应保证 CI 预取阶段重试或使用本地等价资源，避免：

- 第三方请求；
- 隐私泄露；
- 线上网络抖动影响卡片/灯箱体验。

若下载的是同一图像字节，用户视觉表现不变。

## 5.6 自托管 Brotli sidecar

对当前文本资产：

| 资产 | gzip | Brotli | 节省 |
|---|---:|---:|---:|
| HTML | 16.7 KB | 12.5 KB | 4.2 KB |
| CSS | 23.0 KB | 20.0 KB | 3.0 KB |
| JS | 14.0 KB | 12.5 KB | 1.5 KB |

合计约 8.7 KB。GitHub Pages 已做压缩，收益有限；自托管时可生成 `.br` sidecar 并按 `Accept-Encoding` 返回。

## 5.7 回访缓存

`_astro` 已是 hash + immutable。`dist/assets` 图片在自托管服务中为 1 小时缓存。可为稳定图片引入内容 hash URL 或可靠 ETag，改善回访秒开；这不解决首访冷缓存，且要避免内容更新后陈旧。

---

## 6. 建议实施顺序

### Phase 0：先加护栏，再优化

新增 `npm run test:performance`：

1. 冷缓存移动 4x CPU + 1.6 Mbps；
2. 覆盖 `/`、`/research`、`/features`、`/gallery`；
3. 断言：
   - FCP / LCP / load / CLS；
   - 子资源字节数；
   - 初始图片候选宽度；
   - 音频 `preload=none`；
   - 无 CSS 背景图；
   - idle prefetch 预算；
   - 字体请求数量；
   - 无 >50ms 首屏 Long Task（或记录阈值）。
4. 加入视觉截图 diff / SSIM 阈值；
5. 保留现有 700+ 单测。

### Phase 1：高置信无损优化

1. 字体子集化（同字体、同字重、同 `font-display`）；
2. 响应式图片候选按 `max_css_size × 3x` 裁剪，并补固定小图 1x/2x/3x；
3. 空闲预取加延迟、用户活动、网络与字节预算。

### Phase 2：critical CSS

1. 生成路由 critical CSS；
2. 完整 CSS 非阻塞；
3. SPA swap 前确保样式可用；
4. 用 4 语言 × 双主题 × 双端截图验证无 FOUC。

### Phase 3：结构减量

1. 热力图 tooltip 索引化；
2. Shiki class 化 / code block `content-visibility`；
3. JS feature split；
4. 搜索索引分语言。

---

## 7. 建议验收目标

在本地移动 4x CPU + 1.6 Mbps 冷缓存下：

| 指标 | 当前 | 目标 |
|---|---:|---:|
| 首页 FCP | 1.27–1.55s | <1.0s |
| 首页 LCP | 1.27–1.55s | <1.25s |
| 首页 load | 3.71–3.97s | <3.0s |
| 首页子资源 | 504 KB | <400 KB，理想 <350 KB |
| Gallery load | 4.27–4.32s | <3.5s |
| idle prefetch | 无上限，曾 8s +4.8 MB | ≤500–750 KB/会话 |
| 首屏 Long Task | 0（首页） | 保持 0 |
| 视觉 | — | 截图/SSIM 阈值内 |

首页 CLS 暂不设为硬门槛，除非允许修改流式/横幅动画；当前 0.162 来自有意布局动画。

---

## 8. 不建议直接做的事

- 不建议 `font-display: optional`。
- 不建议无条件 preload 40 KB Mono 字体。
- 不建议把 100 KB CSS 全量内联到每个语言页。
- 不建议直接把移动端图片统一封到 768px 后发布；必须先做视觉验收。
- 不建议用自定义 JS 懒加载替代原生 `<img loading=lazy>`，除非保留无 JS 降级并验证滚动体验。
- 不建议为 CLS 指标预留 stream 完整高度；该方案已因改变表现被 revert。
- 不建议为了 load 指标移除 GitHub 热力图、RSS、BGM、流式动画或高亮。

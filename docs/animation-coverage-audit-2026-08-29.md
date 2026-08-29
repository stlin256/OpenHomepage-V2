# 动画覆盖缺口审计报告（2026-08-29）

## 结论

前台公开页的动效基础较好：滚动显现、卡片 hover、灯箱、通知横幅、联系卡、二维码弹窗、流式打字、贡献图入场都有覆盖。但交互闭环中仍有三类明显断层：

1. **编辑器 / overlay 的高频面板没有任何出现与退出动画**，其中插入抽屉和检查器在规格中明确写作“右侧滑出”，当前实现是直接 append/remove。
2. **SPA 语言与页面切换只处理了主内容淡入淡出**，header 内站点标题、导航列表、页脚、当前 tab 状态是硬替换，视觉上会“瞬移”。
3. **动效缺少系统性回归守护**：当前只有语言菜单 FLIP 有直接测试；灯箱、主题、overlay 面板、reduced-motion 主要依赖 CSS 人工检查。

## 审计范围与方法

- 前台全局交互：`src/scripts/interactions.ts`、`src/scripts/theme.ts`、`src/scripts/bgm.ts`、`src/scripts/heatmap.ts`、`src/styles/global.css`
- 前台组件与规格：`src/components`、`src/layouts/BaseLayout.astro`、`docs/specs/09-animations.md`、`10-theme-colors.md`、`11-i18n.md`
- 后台与可视化编辑：`admin/ui/main.ts`、`admin/ui/views/`、`admin/ui/overlay/`、`admin/public/styles.css`
- 测试覆盖：`tests/` 中 animation / transition / FLIP / reduced-motion 相关用例

## P1：优先补齐

### 1. 可视化编辑 overlay 的抽屉 / 检查器 / 流式编辑窗口无出现与退出动画

- 证据：
  - `admin/ui/overlay/inserter.ts:138-145`：打开时 `doc.body.append(mask, panel)`，关闭时直接 `remove()`
  - `admin/ui/overlay/inspector.ts:255-277`：同样直接 append/remove
  - `admin/ui/overlay/streamedit.ts:81,116`：窗口创建后直接显示，关闭直接 `root.remove()`
  - `admin/ui/overlay/overlay.css:248-331,683-693`：遮罩与右侧面板没有 transition/animation
  - `docs/specs/12-visual-editor.md` 多处描述为“右侧滑出面板 / 检查器滑出”
- 现状：功能正确，但状态变化是 0ms 闪现，和规格中的“滑出”不一致，也最接近用户会反复触发的编辑动作。
- 建议：
  - 遮罩：opacity 0 → 1，140ms
  - 面板：opacity 0 + `translateX(16px)` → 1 / 0，200–220ms，统一 `cubic-bezier(0.22, 1, 0.36, 1)`
  - 退出：反向 120–140ms，动画结束后再 remove
  - 用 `is-open` / `is-closing` 状态类避免直接 `display:none` 截断过渡
- reduced-motion：仅保留 80–120ms opacity，不做位移。

### 2. Admin 通用 modal 无进场 / 退场动画

- 证据：
  - `admin/public/styles.css:273-292`：`.modal-overlay` 与 `.modal` 无 transition/animation
  - `admin/ui/main.ts:130`、`admin/ui/views/pages.ts:145,227`：关闭函数直接 `overlay.remove()`
- 影响：新建页面、快照、创建其他语言版等操作均会硬出现 / 硬消失。
- 建议：
  - overlay 淡入 140ms
  - dialog opacity + `translateY(8px)` / `scale(0.98)` 进入 200ms
  - 关闭反向 120ms；监听 `transitionend` 并保留 180ms 兜底
- reduced-motion：只做 opacity。

### 3. SPA 切换时 header / nav / footer 文本与状态硬替换

- 证据：
  - `src/scripts/interactions.ts:301-329`：主内容、页脚、站点标题、导航列表均 `replaceChildren` / 直接改 `textContent`
  - `src/scripts/interactions.ts:235-246`：导航 active class 直接切换
  - `src/styles/global.css:168-174`：active 样式存在，但没有跨项动画
  - `src/styles/global.css:2150-2151`：主内容只有 120ms opacity 过渡
- 现状：主内容有淡入淡出，但 header 的站点标题、导航项、页脚文本和 active 指示会在同一瞬间跳变；语言切换时尤其明显。
- 建议：
  - 站点标题 / 页脚：新旧文本 160–180ms crossfade，可加 4px 上移
  - 导航列表：180ms crossfade 或 FLIP；active 背景做共享高亮块的 transform/size 过渡
  - 主内容新页进入可在 opacity 外增加 12–16px 上移，但必须等遮罩结束后启动，避免性能与闪烁
- reduced-motion：仅 opacity，不做位移 / FLIP。

### 4. 动效自动化守护不足

- 证据：`rg animation|transition|prefers-reduced-motion tests` 只命中 `tests/interactions.test.ts:140` 的语言菜单 FLIP 用例；灯箱、主题、overlay 面板、admin modal、reduced-motion 没有直接断言。
- 风险：后续样式重构很容易像“规格写滑出、实现变硬出现”一样发生漂移。
- 建议：
  - jsdom：对 open/close 类名、`animate()` keyframes、remove 时机做单元测试
  - Playwright：对 overlay/modal/menu 捕获进入中与终态 transform/opacity
  - 增加 reduced-motion 快照或计算样式断言
  - 至少加一个测试防止 `transition` / `animation` 属性被误删

## P2：值得补齐

### 5. 语言菜单自身开合仍是 `display:none` ↔ `display:block`

- 证据：`src/styles/global.css:278-295`；`src/scripts/interactions.ts:481-503`。
- 现状：菜单内部换行已有 A 方案 FLIP，但菜单从图标下方出现 / 消失本身没有动画。
- 建议：180ms opacity + `translateY(-4px)` + `scale(0.98)`，origin top right；关闭 120ms。hover 展开需要防抖，避免鼠标经过时闪烁。
- reduced-motion：只保留 opacity。

### 6. 明暗主题切换覆盖不完整，图标状态硬切

- 证据：
  - `src/styles/global.css:96-107` 只给 body、导航容器、图标按钮、home block、pre、footer 加颜色过渡
  - `src/styles/global.css:324-331` 太阳 / 月亮通过 display 硬切
  - `admin/public/styles.css` 没有对应的主题颜色过渡
- 影响：前台部分区域平滑、部分文字/卡片/链接瞬变；admin 更明显。
- 建议：
  - 前台不要盲目 universal `*` transition；点击时临时加 `html.theme-switching`，对主要 surface/text/border 做 200ms 颜色过渡，220ms 后移除
  - 图标用 160ms crossfade + 轻微 rotate/scale
  - admin 补同样的 scoped 颜色过渡与图标过渡
- reduced-motion：颜色过渡可以保留，但图标不做旋转位移。

### 7. Admin SPA 路由主区域硬清空 / 硬重建

- 证据：`admin/ui/main.ts:168-204`。
- 影响：侧栏页面 / 配置 / 素材切换时内容瞬间跳变。
- 建议：旧视图 100ms 淡出，新视图 160ms 淡入 + 8px 上移；异步加载时给轻量 skeleton 或 120ms 延迟 spinner，避免 API 抖动。
- 注意：编辑器场景优先响应速度，动画不宜超过 180ms。

### 8. Admin 侧栏折叠是 `display:none`

- 证据：`admin/public/styles.css:101`；`admin/ui/layout-state.ts:19-21`；`admin/ui/main.ts:322-335`。
- 建议：使用 grid 宽度或 transform 方案做 180–220ms 折叠。若要避免主区 reflow，可用 `margin-left` / width + opacity；PC 工具场景可接受少量 layout，动画期间暂停不必要的重排。
- reduced-motion：直接切换或仅 opacity。

### 9. Admin 首页布局排序器没有 FLIP

- 证据：
  - `admin/ui/views/configs.ts:411-487`：上移 / 下移 / 删除 / 添加 / 拖拽后都 `renderLayout()` 重建 DOM
  - `admin/public/styles.css:208-221`：只有 dragging 半透明，没有行移动动画
- 建议：沿用语言菜单的 FLIP 思路，记录行位置 → 重排 → WAAPI 反向位移；添加用 height/opacity 进入，删除反向退出。
- reduced-motion：直接重排。

### 10. GitHub 热力图 tooltip 硬显示 / 硬隐藏

- 证据：`src/scripts/heatmap.ts:19,26,35` 用 hidden 切换；`src/styles/global.css:1741-1755` 无 transition。
- 建议：120ms opacity + `translateY(4px)`，tooltip 重定位时可用 transform 平滑；隐藏时不可保留 pointer 事件。
- reduced-motion：只做 opacity。

### 11. BGM 播放 / 暂停图标硬切

- 证据：`src/styles/global.css:335-355`；`src/scripts/bgm.ts:53-61`。
- 建议：播放 / 暂停图标 140ms crossfade，可加轻微 scale；按钮颜色已有 hover 反馈。
- 注意：功能在 reduced-motion 下整体隐藏，因此无需额外降级分支。

### 12. Overlay 工具条 / hover 描边 / 微编辑切换硬切

- 证据：
  - `admin/ui/overlay/overlay.css:116-129,158-203`
  - `admin/ui/overlay/textedit.ts:90-112`：原块 display:none、编辑器直接插入，关闭后直接反向
- 建议：
  - hover outline：80–100ms opacity/outline-color，不宜大幅位移，保持编辑定位稳定
  - 工具条：100–120ms opacity + 4px 位移，位置更新仍应即时，避免编辑目标感知延迟
  - 微编辑器：原块淡出 100ms，编辑器淡入 160ms；关闭反向
- reduced-motion：outline 可直接切换，编辑器仅 opacity。

## P3：可选精修

| 位置 | 证据 | 缺口 | 建议 |
|---|---|---|---|
| 慢速普通导航 loading | `src/styles/global.css:2153-2170`：`.visible` 仍是 opacity:0，spinner 实际不可见 | 长请求无可见反馈 | 若保留语言切换透明输入门，可拆成 language gate 与普通 loading：普通导航 150ms 后显示轻量 spinner；语言切换维持透明 |
| 页面切换后回到顶部 | `src/scripts/interactions.ts:363` 直接 `scrollTo(top)` | 顶部跳变生硬 | 可 180ms smooth scroll，但必须谨慎与新页 reveal 时序配合；reduced-motion 直接跳 |
| Admin 保存状态文本 | `admin/ui/main.ts:225-231` 直接改 textContent/class | 状态变化无反馈 | 120ms crossfade；错误态可轻微 color pulse |
| Admin dev 状态灯 up/down | `admin/public/styles.css:358-384` | starting 有 pulse，up/down 颜色硬切 | 给 background/opacity 150ms 过渡 |
| 素材拖拽落区 | `admin/ui/views/assets.ts:83-88` | dragover 无视觉状态 | dragenter/dragleave + 150ms border/background/faint scale |
| RSS 封面加载失败 | `src/components/blocks/RssCard.astro:19` onerror 直接 remove wrapper | 布局瞬间塌陷 | 可保留占位并淡出，或给卡片最小高度；需权衡 CLS |
| 懒加载图片 | 多处 loading=lazy | 图片解码出现硬切 | 仅对视口下方非 LCP 图片做 160ms opacity，避免影响 LCP 与低端设备 |

## 已覆盖较好、不建议继续加动画

- 滚动显现：`src/scripts/motion.ts` + `src/styles/global.css:2131-2146`，首屏基线处理合理。
- 卡片 hover：GitHub / RSS / editorial / archive 卡已有 transform、filter、阴影与 focus-visible。
- 图片灯箱：开关都有 opacity/scale，关闭有 transitionend + timeout 兜底。
- 通知横幅：入场 / 关闭已有动画，且 reduced-motion 会去掉位移。
- 联系卡与二维码弹窗：入场、退出均有动画。
- 流式打字：核心体验已有，reduced-motion 直接完整呈现。
- 贡献图格子：已有入场 stagger。
- 移动端导航抽屉与汉堡图标：已有 transform 过渡。
- Admin 原生 details 折叠面板：规格明确“不引入动画依赖”，不建议为一致性额外加复杂动画。

## 实施顺序建议

1. **P1-1 / P1-2**：先做 overlay 与 admin modal，因为规格已经承诺滑出，且收益最高。
2. **P1-3**：补 SPA header/nav/footer crossfade，让语言切换整体质感闭环。
3. **P1-4**：同步补测试，防止后续动效被重构掉。
4. **P2**：按语言菜单开合 → 主题 → admin 路由 / 侧栏 / 排序 FLIP 推进。
5. **P3**：结合性能实测逐项决定，不建议一次性全加。

## 统一动效规范建议

- 常用时长：micro feedback 80–140ms；panel/modal 160–220ms；page-level 180–260ms。
- 缓动：继续使用 `cubic-bezier(0.22, 1, 0.36, 1)`；轻回弹只用于用户明确选择的对象（如语言菜单 A 方案）。
- 属性：优先 opacity/transform；颜色过渡只用于主题与状态变化；避免普遍 height/padding 动画。
- 退出动画要短于进入动画，且有 timeout 兜底。
- 所有新增动效必须显式处理 `prefers-reduced-motion: reduce`。

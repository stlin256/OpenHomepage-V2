# 动效清单与性能预算（细化项 #9）

> 状态：✅ 已确认（2026-08-22）——按清单实现；性能预算作为软目标（不设硬性卡线），实现时注意优化。

## 1. 动效清单

| 动效 | 场景 | 实现 | 开销 |
|------|------|------|------|
| 页面转场 | 路由切换：旧页淡出 + 新页淡入上移 | Astro View Transitions | 低 |
| 滚动显现 | 区块/卡片进入视口：透明度 + 上移 16px 渐入 | IntersectionObserver + CSS | 低 |
| 杂志视差 | 主页头图/头像随滚动轻微视差（≤40px 位移） | rAF + transform | 中 |
| 卡片 hover | 微浮起（translateY -4px + 阴影加深）+ 主题色描边 | 纯 CSS | 低 |
| RSS 浮层 | 300ms 延迟浮出 + 缩放淡入 | 纯 CSS/JS 定时器 | 低 |
| 流式打字 | 见 04 文档 | rAF/定时器 | 低 |
| 主题切换 | 明暗切换时 200ms 颜色过渡 | CSS transition on colors | 低 |
| 图片灯箱 | 开/关：淡入淡出 + 缩放（0.92→1）250ms；reduced-motion 只留淡入 | CSS transition（opacity/transform） | 低 |
| 贡献图 | 格子按周交错淡入（stagger 20ms） | CSS animation-delay | 低 |

可点元素（导航 tab、图标按钮、链接）hover 反馈为**高亮背景块**（`--hover-bg`：
浅色加深 / 深色提亮，圆角，≤200ms 过渡），纯 CSS，不做鼠标跟随位移。
（原"磁吸按钮"动效已废弃移除——实测跟随指针位移观感不佳。）

统一缓动：`cubic-bezier(0.22, 1, 0.36, 1)`（easeOutQuint 系）；时长 200–500ms。

## 2. 全局规则

- `prefers-reduced-motion: reduce` 时：禁用视差/流式，仅保留简单淡入。
- 所有动效只用 `transform` 和 `opacity`（合成层属性），禁止触发 layout/paint。
- 移动端关闭视差（触摸无意义且耗电），保留淡入。

## 2.1 实现注记（M4b）

- 贡献图分档：**按当年单日最大贡献数线性分 4 档**（非 GitHub 官方的分位数分档），
  规则可预测、可单测；0 次固定 0 档（中性灰），1–4 档 accent 渐强（色阶构建时从
  accent 与底色混合计算，明暗两套，见 `src/lib/github-block.ts` heatScale）。
- bilibili/youtube 嵌入已改为**直接渲染官方 iframe**（`loading="lazy"`，见 spec 03 §1），
  不再有封面占位/点击加载逻辑（原封面方案：bilibili 封面需 API 查询构建期拿不到，已废弃）。
- 滚动显现首屏基线：`.reveal` 默认可见，不等待 JS/IntersectionObserver；前端首帧前只给当前视口外元素追加 `.reveal-pending`。无 JS 或首屏内容都不隐藏，避免 LCP 被动效脚本延迟。
- 贡献图明暗色阶只作为自定义属性注入区块根节点，再由 scoped CSS 暴露给格子；禁止在组件级使用 `define:vars`，避免同一组颜色复制到数百个后代节点。

## 3. 性能预算

| 指标 | 预算 |
|------|------|
| 首页总传输量 | ≤ 1.5 MB（含字体子集、头像） |
| 首屏 JS | ≤ 60 KB gzip（岛屿按需注水，不动效组件零 JS） |
| 字体 | 每字重 ≤ 120 KB（思源黑体子集化 + unicode-range 分片） |
| Lighthouse 性能分 | ≥ 90 |
| 动效帧率 | 稳定 60fps，长任务 < 50ms |

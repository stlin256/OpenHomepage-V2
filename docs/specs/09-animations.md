# 动效清单与性能预算（细化项 #9）

> 状态：✅ 已确认（2026-08-22）——按清单实现；性能预算作为软目标（不设硬性卡线），实现时注意优化。

## 1. 动效清单

| 动效 | 场景 | 实现 | 开销 |
|------|------|------|------|
| 页面转场 | 路由切换：旧页淡出 + 新页淡入上移 | Astro View Transitions | 低 |
| 滚动显现 | 区块/卡片进入视口：透明度 + 上移 16px 渐入 | IntersectionObserver + CSS | 低 |
| 杂志视差 | 主页头图/头像随滚动轻微视差（≤40px 位移） | rAF + transform | 中 |
| 磁吸按钮 | 导航 tab / 链接图标向鼠标轻微吸附（≤6px） | pointermove + transform | 中 |
| 卡片 hover | 微浮起（translateY -4px + 阴影加深）+ 主题色描边 | 纯 CSS | 低 |
| RSS 浮层 | 300ms 延迟浮出 + 缩放淡入 | 纯 CSS/JS 定时器 | 低 |
| 流式打字 | 见 04 文档 | rAF/定时器 | 低 |
| 主题切换 | 明暗切换时 200ms 颜色过渡 | CSS transition on colors | 低 |
| 贡献图 | 格子按周交错淡入（stagger 20ms） | CSS animation-delay | 低 |

统一缓动：`cubic-bezier(0.22, 1, 0.36, 1)`（easeOutQuint 系）；时长 200–500ms。

## 2. 全局规则

- `prefers-reduced-motion: reduce` 时：禁用视差/磁吸/流式，仅保留简单淡入。
- 所有动效只用 `transform` 和 `opacity`（合成层属性），禁止触发 layout/paint。
- 移动端关闭磁吸和视差（触摸无意义且耗电），保留淡入。

## 2.1 实现注记（M4b）

- 贡献图分档：**按当年单日最大贡献数线性分 4 档**（非 GitHub 官方的分位数分档），
  规则可预测、可单测；0 次固定 0 档（中性灰），1–4 档 accent 渐强（色阶构建时从
  accent 与底色混合计算，明暗两套，见 `src/lib/github-block.ts` heatScale）。
- bilibili 嵌入封面：封面图需 API 查询，构建期拿不到 → 纯色 + 播放按钮占位；
  youtube 用公开的 `i.ytimg.com/vi/{id}/hqdefault.jpg` 缩略图。
- 动效初始隐藏态（.reveal 等）只挂在 `html.js` 下：无 JS 时内容不隐藏。

## 3. 性能预算

| 指标 | 预算 |
|------|------|
| 首页总传输量 | ≤ 1.5 MB（含字体子集、头像） |
| 首屏 JS | ≤ 60 KB gzip（岛屿按需注水，不动效组件零 JS） |
| 字体 | 每字重 ≤ 120 KB（思源黑体子集化 + unicode-range 分片） |
| Lighthouse 性能分 | ≥ 90 |
| 动效帧率 | 稳定 60fps，长任务 < 50ms |

---
title: "特性"
nav: true
order: 3
slug: "features"
date: 2026-08-29
updated: 2026-08-29
feed:
  enabled: true
toc: true
reading_progress: true
description: "本站点 markdown 渲染能力的完整演示"
---

这一页集中演示站点支持的所有内容形态。源文件就是一个普通的 markdown 文件（`data/pages/zh/features.md`），你可以在编辑器里打开它对照查看。

## 文本与排版

支持 **加粗**、*斜体*、~~删除线~~、`行内代码`、[带标题的链接](https://example.com "悬停看我")与**富媒体交互脚注**[^fn-academic]。在现代学术排版与技术博客中，脚注不仅能承载文献引用[^fn-spec]，还能容纳包含公式与多段说明的技术注释[^fn-tech]。

[^fn-academic]: **Vaswani et al. (2017)**. *Attention Is All You Need*. Advances in Neural Information Processing Systems (NeurIPS 2017). [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)
[^fn-spec]: 标准 CommonMark 与 GFM 脚注语法扩展，支持桌面端智能气泡与移动端抽屉交互。
[^fn-tech]: 支持在脚注中嵌入行内代码 `O(N \log N)` 以及公式 $L = -\sum y \log \hat{y}$。

> 杂志式排版里，引用块是最好的呼吸节奏。
> —— 某位排版爱好者

- 无序列表项甲
- 无序列表项乙
  - 嵌套一项

- [x] 已完成：搭建静态站点
- [x] 已完成：markdown 渲染管线
- [ ] 进行中：写更多内容

| 特性 | 语法 | 渲染方 |
|------|------|--------|
| 代码高亮 | ` ```python ` | Shiki |
| 数学公式 | `$E=mc^2$` | KaTeX |
| 内嵌播放器 | `::bilibili{}` | 自定义指令 |

## 代码高亮

```python
import torch

def cosine_lr(step: int, total: int, base: float = 3e-4) -> float:
    """余弦退火学习率。"""
    t = min(step / total, 1.0)
    return base * 0.5 * (1 + torch.cos(torch.tensor(t * 3.14159)))
```

## 数学公式

行内公式 $e^{i\pi} + 1 = 0$，以及块级的 softmax：

$$
\mathrm{softmax}(z_i) = \frac{\exp(z_i)}{\sum\nolimits_{j=1}^{K} \exp(z_j)}
$$

## 图文排版

:::figure{src="assets/figure-1.jpg" caption="图 1：国产大飞机 C909 低空掠过（figure 指令，带宽度和图注）" width="72%"}
:::

多栏网格（移动端自动塌缩为单列）：

::::grid{cols=2}
:::cell
左栏是一段文字。杂志化排版的关键在于**留白与对齐**，而不是装饰。
:::
:::cell
:::figure{src="assets/figure-2.jpg" caption="海心桥的晚霞" width="100%"}
:::
:::
::::

## 内嵌播放器

播放器以响应式 16:9 容器直接渲染官方 iframe（`loading="lazy"` 惰性加载，不拖慢首屏）：

::youtube{id="aircAruvnKk" poster="assets/cover-youtube-aircaruvnkk.jpg"}

::bilibili{bvid="BV13z421U7cs"}

自建媒体（原生标签）：

:::video{src="assets/feature-flower.mp4" poster="assets/feature-flower-poster.jpg"}
:::

:::audio{src="assets/bgm.mp3" title="Goldberg Variations, BWV 988 · Aria"}
:::

:::audio{src="assets/bgm.mp3" cover="assets/goldberg-aria-cover.jpg" title="Bach: The Goldberg Variations, BWV 988 — Aria" description="Johann Sebastian Bach · The 1981 Recordings"}
:::

## 功能指令

| 组件名称 | 说明 |
|---------|------|
| GitHub Repo Card | 单个仓库卡片，读取 pinned 缓存 |
| Streaming Block | LLM 流式输出效果，支持重播 |
| Editorial Block | 按钮、列表卡、磁贴、归档卡、分割线组合 |

**GitHub Repo Card**：正文任意位置插入仓库卡片：

::ghcard{repo="ggml-org/llama.cpp"}

**Streaming Block**：插入一个流式区块（定义在 `site.yaml` 的 `streaming_blocks`）：

::stream{id="welcome"}

## 编辑风组件

下面的完整组件套件由 `::editorial{id="features"}` 从 `site.yaml` 的 `editorial_blocks` 嵌入，覆盖按钮组、编号列表、磁贴、归档卡和分割线：

::editorial{id="features"}

右下角联系卡、二维码弹层、亮/暗主题、语言切换、背景音乐、图片灯箱和滚动显现是全局组件；在本页直接交互就能看到。

| 全局组件名称 | 入口 |
|-------------|------|
| Contact Card / QR Modal | 右下角联系卡，点击打开二维码弹层 |
| Theme Toggle | 右上角太阳 / 月亮按钮 |
| Language Switcher | 右上角语言按钮 |
| BGM Toggle | 右上角播放 / 暂停按钮 |
| Lightbox | 点击正文中的图片 |
| Scroll Reveal | 滚动页面时区块显现 |

主页专属组件也在下方完整渲染，不依赖主页是否启用：Profile Block、GitHub Block、RSS Block。

## Profile Block · 资料区

<div data-feature-slot="profile"></div>

## GitHub Block · 贡献热力图 + 仓库卡

<div data-feature-slot="github"></div>

## RSS Block · 内容卡片流

<div data-feature-slot="rss"></div>

## 页面控件

页面控件是针对单个页面按需添加的部件（非全局组件），每个页面可以在 frontmatter 中独立定义；离开或重新打开该页面时会再次出现，提供针对单页的提示与操作能力。

| 页面控件 | 配置方式 | 特性说明 |
|---------|----------|----------|
| 顶端通知横幅（Notice Banner） | 页面 frontmatter 设置 `notice: "..."` 或 `notice: { text: "...", color: "yellow" }` | 页面加载完成 0.5s 后延迟弹出，支持 4 种颜色（`accent` 主题色、`yellow` 黄色、`red` 红色、`custom` 自定义）；单页独立定义、重新打开页面时再次出现；用户需手动点击右侧 ✕ 关闭；支持内联链接与强调语法 |
| 文章目录（TOC） | 页面 frontmatter 设置 `toc: true` | 桌面端支持右侧粘性吸顶与 ScrollSpy 当前标题高亮跟随，移动端支持折叠抽屉导航，长文浏览快速跳转 |
| 阅读进度条（Reading Progress Bar） | 页面 frontmatter 设置 `reading_progress: true` | 页面顶端 2px 细线进度条，随着正文向下滚动实时响应阅读位置，本特性页面已默认开启，可在滚动时观察页面最顶部细线动画 |

> 💡 示例：当前站点的[首页](/)顶部即配置了醒目的黄色通知横幅（`notice: { text: "本页面为示例页面，内容仅为展现项目特性使用。", color: "yellow" }`），可在首页体验 0.5s 延迟弹出与手动关闭效果。

## HTML 混写

<mark>这一行是原生 HTML 的 mark 标签</mark>，dangerous 标签（如 `<script>`）会被白名单过滤。


## 注记卡片与时间线

P0 内容指令保持零前端脚本：callout 用于解释、警示和引用，时间线用于教育、经历与里程碑。

:::note{title="复现入口"}
论文、工具与实验记录保留在同一个索引中，方便后续复核。
:::

:::tip{title="性能边界"}
新增内容指令默认在构建期渲染，不增加首屏 JavaScript。
:::

:::warning{title="谨慎结论"}
单次评测分数不能替代分布报告。
:::

:::quote{title="Field Note" source="Zhiyuan Lin, 2026"}
系统优化的价值来自可重复的测量，而不是一次偶然的加速。
:::

::::timeline{title="Education & Experience"}
:::timeline-item{start="2022" end="2026" title="PhD Candidate" org="Example University" url="/research" highlight="true"}
研究方向为机器学习与系统，重点关注推理调度与可复现评测。
:::
:::timeline-item{start="2026" title="Research Intern" org="Example Lab"}
参与边缘设备上的大模型推理实验。
:::
::::

## 学术成果与文献注记

`data/publications.yaml` 是成果数据的权威来源，`publications.bib` 按 key 合并原始 BibTeX。下面的列表在构建期完成筛选、排序与分组；BibTeX 复制是唯一渐进增强交互。

::publications{tag="systems" limit="3" group="year" sort="date-desc"}

本站点深度支持现代学术排版与**富媒体交互脚注**[^fn-academic]。在桌面端悬停或聚焦角标可直接唤起智能气泡，查阅文献来源与包含行内代码或公式的技术注释[^fn-tech]；移动端则以平滑底部抽屉展开，并在文末提供完整的参考文献附录与精准平滑回跳导航[^fn-spec]。

[^fn-academic]: **Vaswani et al. (2017)**. *Attention Is All You Need*. Advances in Neural Information Processing Systems (NeurIPS 2017). [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)
[^fn-spec]: 标准 CommonMark 与 GFM 脚注语法扩展，支持桌面端智能气泡与移动端抽屉交互。
[^fn-tech]: 支持在脚注中嵌入行内代码 `O(N \log N)` 以及公式 $L = -\sum y \log \hat{y}$。


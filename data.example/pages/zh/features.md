---
title: "特性"
nav: true
order: 3
slug: "features"
description: "本站点 markdown 渲染能力的完整演示"
---

这一页集中演示站点支持的所有内容形态。源文件就是一个普通的 markdown 文件（`data/pages/zh/features.md`），你可以在编辑器里打开它对照查看。

## 文本与排版

支持 **加粗**、*斜体*、~~删除线~~、`行内代码`、以及[带标题的链接](https://example.com "悬停看我")。

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
\mathrm{softmax}(z_i) = \frac{\exp(z_i)}{\sum_{j=1}^{K} \exp(z_j)}
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

播放器默认显示封面占位，**点击后才加载** iframe，页面打开飞快：

::youtube{id="aircAruvnKk"}

::bilibili{bvid="BV13z421U7cs"}

自建媒体（原生标签）：

:::video{src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"}
:::

:::audio{src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"}
:::

## 功能指令

正文任意位置插入 GitHub 仓库卡片：

::ghcard{repo="ggml-org/llama.cpp"}

插入一个流式区块（定义在 `site.yaml` 的 `streaming_blocks`）：

::stream{id="welcome"}

## HTML 混写

<mark>这一行是原生 HTML 的 mark 标签</mark>，dangerous 标签（如 `<script>`）会被白名单过滤。

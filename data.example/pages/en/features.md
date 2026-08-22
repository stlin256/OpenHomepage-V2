---
title: "Features"
nav: true
order: 3
slug: "features"
description: "A full tour of what this site's markdown rendering can do"
---

This page demonstrates every content type the site supports. The source is a plain markdown file (`data/pages/en/features.md`) — open it in the editor to compare.

## Text & typography

**Bold**, *italic*, ~~strikethrough~~, `inline code`, and [titled links](https://example.com "hover me").

> In magazine typography, blockquotes are the breathing room.
> — a typography enthusiast

- Unordered item A
- Unordered item B
  - Nested item

- [x] Done: static site pipeline
- [x] Done: markdown rendering
- [ ] Doing: write more content

| Feature | Syntax | Renderer |
|---------|--------|----------|
| Code highlight | ` ```python ` | Shiki |
| Math | `$E=mc^2$` | KaTeX |
| Embed player | `::bilibili{}` | Custom directive |

## Code highlight

```python
import torch

def cosine_lr(step: int, total: int, base: float = 3e-4) -> float:
    """Cosine-annealed learning rate."""
    t = min(step / total, 1.0)
    return base * 0.5 * (1 + torch.cos(torch.tensor(t * 3.14159)))
```

## Math

Inline $e^{i\pi} + 1 = 0$, and block-level softmax:

$$
\mathrm{softmax}(z_i) = \frac{\exp(z_i)}{\sum_{j=1}^{K} \exp(z_j)}
$$

## Figures & grids

:::figure{src="assets/figure-1.jpg" caption="Fig. 1: a COMAC C909 flying low overhead (figure directive with width & caption)" width="72%"}
:::

Two-column grid (collapses to one column on mobile):

::::grid{cols=2}
:::cell
Text on the left. Magazine typography is about **whitespace and alignment**, not decoration.
:::
:::cell
:::figure{src="assets/figure-2.jpg" caption="Sunset over Haixin Bridge" width="100%"}
:::
:::
::::

## Embedded players

Players render the official iframe directly in a responsive 16:9 container (`loading="lazy"`, so first paint stays fast):

::youtube{id="aircAruvnKk"}

::bilibili{bvid="BV13z421U7cs"}

Self-hosted media (native tags):

:::video{src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"}
:::

:::audio{src="https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"}
:::

## Functional directives

Drop a GitHub repo card anywhere in the body:

::ghcard{repo="ggml-org/llama.cpp"}

Embed a streaming block (defined under `streaming_blocks` in `site.yaml`):

::stream{id="welcome"}

## Raw HTML mixing

<mark>This line uses the native HTML mark tag</mark>. Dangerous tags like `<script>` are filtered by a whitelist.

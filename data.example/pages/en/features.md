---
title: "Features"
nav: true
order: 3
slug: "features"
date: 2026-08-29
updated: 2026-08-29
feed:
  enabled: true
toc: true
reading_progress: true
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
\mathrm{softmax}(z_i) = \frac{\exp(z_i)}{\sum\nolimits_{j=1}^{K} \exp(z_j)}
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

::youtube{id="aircAruvnKk" poster="assets/cover-youtube-aircaruvnkk.jpg"}

::bilibili{bvid="BV13z421U7cs"}

Self-hosted media (native tags):

:::video{src="assets/feature-flower.mp4" poster="assets/feature-flower-poster.jpg"}
:::

:::audio{src="assets/bgm.mp3" title="Goldberg Variations, BWV 988 · Aria"}
:::

:::audio{src="assets/bgm.mp3" cover="assets/goldberg-aria-cover.jpg" title="Bach: The Goldberg Variations, BWV 988 — Aria" description="Johann Sebastian Bach · The 1981 Recordings"}
:::

## Functional directives

| Component | Purpose |
|-----------|---------|
| GitHub Repo Card | Single repository card from the pinned cache |
| Streaming Block | LLM streaming output with replay |
| Editorial Block | Actions, list cards, tiles, archive cards, and dividers |

**GitHub Repo Card**:

::ghcard{repo="ggml-org/llama.cpp"}

**Streaming Block**:

::stream{id="welcome"}

## Editorial components

The complete kit below is embedded by `::editorial{id="features"}` from `editorial_blocks` in `site.yaml`. It covers actions, numbered list cards, tiles, archive cards, and a divider:

::editorial{id="features"}

The contact card, QR modal, light/dark theme, language switcher, background music, image lightbox, and scroll reveal are global components; interact with this page to see them.

| Global component | Entry point |
|------------------|-------------|
| Contact Card / QR Modal | Bottom-right card; click for the QR modal |
| Theme Toggle | Sun / moon button in the top-right |
| Language Switcher | Language button in the top-right |
| BGM Toggle | Play / pause button in the top-right |
| Lightbox | Click an image in the body |
| Scroll Reveal | Blocks reveal as the page scrolls |

The homepage-specific Profile Block, GitHub Block, and RSS Block are also rendered in full below; they do not depend on the homepage layout.

## Page controls

Page controls are page-level widgets configured on a per-page basis (non-global). Each page can define them independently in its frontmatter; they reappear whenever the page is reopened or revisited, providing page-specific announcements and controls.

| Page control | Configuration | Description |
|--------------|---------------|-------------|
| Notice Banner | Set `notice: "..."` or `notice: { text: "...", color: "yellow" }` in frontmatter | Pops in 0.5s after page load; supports 4 color modes (`accent`, `yellow`, `red`, `custom`); page-specific and reappears on every visit; manually dismissed by clicking ✕; supports inline links and formatting |
| Table of Contents (TOC) | Set `toc: true` in frontmatter | Sticky sidebar on desktop with ScrollSpy active heading tracking, collapsible drawer on mobile for seamless navigation |
| Reading Progress Bar | Set `reading_progress: true` in frontmatter | Elegant 2px progress bar fixed at the top of the viewport that tracks reading progress in real time as you scroll; enabled on this features demo page |

> 💡 Example: The [homepage](/en/) of this site features a prominent yellow Notice Banner (`notice: { text: "This is a demo page. Content is for displaying project features only.", color: "yellow" }`) that appears 0.5s after load.

## Raw HTML mixing

<mark>This line uses the native HTML mark tag</mark>. Dangerous tags like `<script>` are filtered by a whitelist.


## Callouts & timeline

The P0 content directives remain script-free at runtime: callouts explain and warn, while timelines present education, experience, and milestones.

:::note{title="Reproducible entry"}
Papers, tools, and experiments stay in one index for later verification.
:::

:::tip{title="Performance boundary"}
New content directives render at build time and add no first-screen JavaScript.
:::

:::warning{title="Careful conclusions"}
A single benchmark score is not a substitute for a distribution report.
:::

:::quote{title="Field Note" source="Zhiyuan Lin, 2026"}
Systems optimization comes from repeatable measurement, not one lucky speedup.
:::

::::timeline{title="Education & Experience"}
:::timeline-item{start="2022" end="2026" title="PhD Candidate" org="Example University" url="/research" highlight="true"}
Focused on machine learning and systems, especially inference scheduling and reproducible evaluation.
:::
:::timeline-item{start="2026" title="Research Intern" org="Example Lab"}
Worked on on-device LLM inference experiments.
:::
::::

## Publications

`data/publications.yaml` is the canonical source, while `publications.bib` supplies raw BibTeX by key. Filtering, sorting, and grouping happen at build time; copying BibTeX is the only progressive enhancement.

::publications{tag="systems" limit="3" group="year" sort="date-desc"}


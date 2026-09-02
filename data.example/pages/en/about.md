---
title: "About"
nav: true
order: 5
slug: "about"
description: "About OpenHomepage V2: Scholarly Restraint Meets Editorial Elegance"
toc: true
---

<div class="about-hero reveal">
  <div class="about-banner-wrap">
    <img class="about-logo about-logo-light" src="assets/logo-banner.webp" alt="OpenHomepage V2" width="360">
    <img class="about-logo about-logo-dark" src="assets/logo-banner-dark.webp" alt="OpenHomepage V2" width="360">
  </div>
  <p class="about-slogan">
    <strong>Scholarly Restraint Meets Editorial Elegance.</strong>
    <span>A static, magazine-style personal homepage generator crafted for researchers, engineers, and creators.</span>
  </p>
  <div class="about-version-badge">
    <span class="version-pill">
      <span class="version-dot" aria-hidden="true"></span>
      <span>Release</span>
      <span class="version-label">v0.1.0</span>
    </span>
  </div>
</div>

## Vision & Philosophy

**OpenHomepage V2** is a static personal homepage generator built on Astro and TypeScript, tailored specifically for scholars, engineers, and creators. Its content and layout are driven entirely by plain Markdown and YAML configuration files.

:::note{title="Design Philosophy"}
Scholarly expression demands restraint and rigor, while editorial typography brings rhythm and reading delight. We eliminate heavy CMS architectures to embrace static delivery and local data ownership.
:::

## Core Capabilities

::::grid{cols=2}
:::cell
### 🎨 Editorial Typography & Layout
- **12-Column Magazine Grid**: Asymmetric whitespace and editorial contrast with seamless mobile collapse.
- **Zero-Flash Dual Themes**: System preference auto-adaptation with instant CSS variable transitions.
- **Hardware Micro-Interactions**: Lightweight transitions strictly honoring `prefers-reduced-motion`.
:::
:::cell
### 📝 Academic Publishing & Media
- **Publications & Citations**: Multi-dimensional filtering, grouping, and 1-click BibTeX copying.
- **Rich Interactive Footnotes**: Viewport-aware desktop popovers and smooth mobile slide-up sheets.
- **Scholarly Typesetting**: KaTeX formulas, Shiki dual-theme syntax highlighting, and timelines.
:::
::::

::::grid{cols=2}
:::cell
### ⚡ Extreme Performance Pipeline
- **Automated Responsive Assets**: Build-time AVIF/WebP multi-density derivative generation.
- **Idle Smart Prefetch**: Sub-second tab and multilingual navigation via idle cache warming.
- **Zero Client Hydration**: Pure static markup with zero client-side JavaScript overhead.
:::
:::cell
### 🛡️ Privacy Decoupling & CI/CD
- **Data Privacy Decoupling**: User `data/` directory is strictly git-ignored and self-contained.
- **Disaster Snapshot Recovery**: Automated CI recovery mechanism ensuring 100% uptime.
- **Full Feed Syndication**: Built-in RSS 2.0, Atom 1.0, and JSON Feed 1.1 generation.
:::
::::

## Getting Started

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
# Clone repository and install dependencies
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install

# Initialize local data directory
npm run setup

# Start development server
npm run dev
```

:::tip{title="Open Source & License"}
OpenHomepage V2 is distributed under the [MIT License](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE). Contributions and feedback are warmly welcomed!
:::

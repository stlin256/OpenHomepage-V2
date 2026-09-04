---
title: "About"
nav: true
order: 5
slug: "about"
description: "About OpenHomepage V2: Scholarly Restraint Meets Editorial Elegance"
toc: false
---

<div class="about-hero reveal">
  <div class="about-banner-wrap">
    <div class="about-brand-banner">
      <span class="about-brand-main">OpenHomepage</span>
      <span class="about-brand-v2">V2</span>
    </div>
  </div>
  <p class="about-slogan">
    <strong>Scholarly Restraint Meets Editorial Elegance.</strong>
    <span>A static, magazine-style personal homepage generator crafted for researchers, engineers, and creators.</span>
  </p>
  <div class="about-version-badge">
    <span class="version-pill">
      <span class="version-dot" aria-hidden="true"></span>
      <span>Release</span>
      <span class="version-label">v0.2.0</span>
    </span>
  </div>
</div>

## Overview

**OpenHomepage V2** is a static personal homepage generator built with Astro, tailored for researchers, engineers, and creators. Content and layout are driven entirely by plain Markdown and YAML configuration files.

::::grid{cols=2}
:::cell
### 🎨 Editorial Layout & Academic Notes
- 12-column asymmetric magazine grid with refined whitespace and mobile responsiveness.
- Native KaTeX formulas, Shiki syntax highlighting, and interactive footnotes.
:::
:::cell
### ⚡ High Performance & Data Sovereignty
- Pure static delivery with zero client JS hydration and automated image derivatives.
- Decoupled `data/` folder keeping personal data private while source code stays open.
:::
::::

## Quick Start

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install && npm run setup && npm run dev
```

:::tip{title="License"}
OpenHomepage V2 is distributed under the [MIT License](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE).
:::
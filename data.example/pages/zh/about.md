---
title: "关于"
nav: true
order: 5
slug: "about"
description: "关于 OpenHomepage V2：极简、杂志风、学术级个人主页生成器"
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
      <span class="version-label">v0.1.0</span>
    </span>
  </div>
</div>

## 项目简介

**OpenHomepage V2** 是一套面向学者、工程师与创作者的静态杂志风个人主页生成器。基于 Astro 构建，全站排版与内容完全由本地纯文本 Markdown 和 YAML 数据驱动。

::::grid{cols=2}
:::cell
### 🎨 杂志排版与学术注记
- 12 列非对称杂志网格，留白克制，移动端优雅自适应。
- 支持 KaTeX 公式、Shiki 双色代码高亮与富媒体交互脚注。
:::
:::cell
### ⚡ 极速构建与数据主权
- 纯静态交付与零客户端水合，构建期自动派生现代图片格式。
- `data/` 目录严格本地隔离，源码公开而个人隐私安全无忧。
:::
::::

## 快速上手

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install && npm run setup && npm run dev
```

:::tip{title="开源许可"}
OpenHomepage V2 遵循 [MIT 开源许可证](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE)。
:::
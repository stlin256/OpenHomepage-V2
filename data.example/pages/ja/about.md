---
title: "概要"
nav: true
order: 5
slug: "about"
description: "OpenHomepage V2 について：研究者・エンジニア・クリエイターのための静的マガジン風ホームページジェネレーター"
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
      <span class="version-label">v{{version}}</span>
    </span>
  </div>
</div>

## 概要

**OpenHomepage V2** は、研究者・エンジニア・クリエイター向けに設計された Astro ベースの静的マガジン風ホームページジェネレーターです。コンテンツと設定はローカルの Markdown および YAML ファイルによって駆動されます。

::::grid{cols=2}
:::cell
### 🎨 マガジン風組版と学術注記
- 12 カラム非対称グリッドによる美しい余白と自然なモバイル対応。
- KaTeX 数式、Shiki コードハイライト、対話型リッチ脚注をサポート。
:::
:::cell
### ⚡ 高速配信とデータ主権
- ゼロハイドレーションによる純粋な静的配信と画像の自動最適化。
- `data/` ディレクトリを完全に分離し、ソース公開時も個人情報を保護。
:::
::::

## クイックスタート

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install && npm run setup && npm run dev
```

:::tip{title="ライセンス"}
OpenHomepage V2 は [MIT License](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE) のもとで公開されています。
:::
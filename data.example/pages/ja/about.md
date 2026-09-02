---
title: "概要"
nav: true
order: 5
slug: "about"
description: "OpenHomepage V2 について：研究者・エンジニア・クリエイターのための静的マガジン風ホームページジェネレーター"
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

## プロジェクトのビジョン

**OpenHomepage V2** は、研究者・エンジニア・クリエイター向けに設計された Astro ベースの静的マガジン風個人ホームページジェネレーターです。コンテンツとレイアウトはすべてローカルの Markdown と YAML 設定ファイルによって駆動されます。

:::note{title="デザイン哲学"}
学術的な表現には節制と厳密さが求められ、マガジン風の組版は余白と読む心地よさをもたらします。重厚な CMS から脱却し、純粋な静的配信とローカルデータ主権を実現します。
:::

## 主な機能と特徴

::::grid{cols=2}
:::cell
### 🎨 マガジン風グリッドと組版
- **12 カラム非対称グリッド**：デスクトップでの美しい余白対比と、モバイルでの自然な 1 列表示。
- **ちらつきのない明暗テーマ**：システム設定に連動し、CSS 変数で瞬時に切り替わります。
- **軽量マイクロインタラクション**：アクセシビリティ仕様に準拠した滑らかなアニメーション。
:::
:::cell
### 📝 学術出版とリッチメディア
- **業績インデックスと引用**：多次元フィルタリング、グループ化、BibTeX の 1 クリックコピー。
- **リッチ対話型脚注**：デスクトップの吹き出しポップオーバーとモバイルのボトムシート。
- **厳密な数式とコード**：KaTeX による数式レンダリングと Shiki によるシンタックスハイライト。
:::
::::

::::grid{cols=2}
:::cell
### ⚡ 圧倒的なパフォーマンス
- **レスポンシブ画像の自動生成**：ビルド時に WebP / AVIF バリアントを自動生成。
- **アイドル時のスマートプリフェッチ**：タブ移動や多言語切り替えが瞬時に行われます。
- **ゼロハイドレーション**：不要なクライアント JS を排除した高速な初期表示。
:::
:::cell
### 🛡️ プライバシー分離と CI/CD
- **ローカルデータ主権**：`data/` ディレクトリは git-ignore され、個人情報を保護。
- **スナップショット災害復旧**：CI 障害時にも過去の安定スナップショットへ自動フォールバック。
- **完全な Feed 配信**：RSS 2.0、Atom 1.0、JSON Feed 1.1 を標準生成。
:::
::::

## クイックスタート

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
# リポジトリをクローンして依存関係をインストール
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install

# ローカルデータディレクトリを初期化
npm run setup

# 開発サーバーを起動
npm run dev
```

:::tip{title="オープンソースとライセンス"}
OpenHomepage V2 は [MIT License](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE) のもとで公開されています。
:::

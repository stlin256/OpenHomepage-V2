---
title: "機能"
nav: true
order: 3
slug: "features"
date: 2026-08-29
updated: 2026-08-29
feed:
  enabled: true
toc: true
reading_progress: true
description: "このサイトのマークダウンレンダリングでできることの全機能ツアー"
---

このページでは、サイトがサポートするすべてのコンテンツタイプを実演します。ソースはプレーンなマークダウンファイル（`data/pages/ja/features.md`）です——エディタで開いて見比べてみてください。

## テキストとタイポグラフィ

**太字**、*斜体*、~~取り消し線~~、`インラインコード`、そして[タイトル付きリンク](https://example.com "hover me")。

> マガジンタイポグラフィにおいて、引用ブロックは呼吸する余白である。
> — あるタイポグラフィ愛好家

- 順序なし項目 A
- 順序なし項目 B
  - ネストされた項目

- [x] 完了：静的サイトパイプライン
- [x] 完了：マークダウンレンダリング
- [ ] 進行中：コンテンツをもっと書く

| 機能 | 構文 | レンダラー |
|---------|--------|----------|
| コードハイライト | ` ```python ` | Shiki |
| 数式 | `$E=mc^2$` | KaTeX |
| 埋め込みプレイヤー | `::bilibili{}` | カスタムディレクティブ |

## コードハイライト

```python
import torch

def cosine_lr(step: int, total: int, base: float = 3e-4) -> float:
    """Cosine-annealed learning rate."""
    t = min(step / total, 1.0)
    return base * 0.5 * (1 + torch.cos(torch.tensor(t * 3.14159)))
```

## 数式

インライン $e^{i\pi} + 1 = 0$、そしてブロックレベルの softmax：

$$
\mathrm{softmax}(z_i) = \frac{\exp(z_i)}{\sum\nolimits_{j=1}^{K} \exp(z_j)}
$$

## 図とグリッド

:::figure{src="assets/figure-1.jpg" caption="図 1：頭上を低空で飛ぶ中国商飛 C909（幅とキャプション付きの figure ディレクティブ）" width="72%"}
:::

2 カラムグリッド（モバイルでは 1 カラムに折りたたまれます）：

::::grid{cols=2}
:::cell
左側にテキスト。マガジンタイポグラフィの本質は装飾ではなく、**余白とアライメント**です。
:::
:::cell
:::figure{src="assets/figure-2.jpg" caption="海心橋に沈む夕日" width="100%"}
:::
:::
::::

## 埋め込みプレイヤー

プレイヤーは公式の iframe をレスポンシブな 16:9 コンテナに直接レンダリングします（`loading="lazy"` なので初回ペイントは高速のままです）：

::youtube{id="aircAruvnKk" poster="assets/cover-youtube-aircaruvnkk.jpg" title="But what is a neural network? | Chapter 1, Deep learning"}

::bilibili{bvid="BV13z421U7cs" poster="assets/cover-bilibili-bv13z421u7cs.jpg" title="【官方双语】GPT是什么？直观解释Transformer | 深度学习第5章"}

セルフホストメディア（ネイティブタグ）：

:::video{src="assets/feature-flower.mp4" poster="assets/feature-flower-poster.jpg"}
:::

:::audio{src="assets/bgm.mp3" title="Goldberg Variations, BWV 988 · Aria"}
:::

:::audio{src="assets/bgm.mp3" cover="assets/goldberg-aria-cover.jpg" title="Bach: The Goldberg Variations, BWV 988 — Aria" description="Johann Sebastian Bach · The 1981 Recordings"}
:::

## 機能ディレクティブ

| コンポーネント | 用途 |
|-----------|---------|
| GitHub リポジトリーカード | ピン留めキャッシュから生成する単一リポジトリーカード |
| ストリーミングブロック | リプレイ付きの LLM ストリーミング出力 |
| エディトリアルブロック | アクション、リストカード、タイル、アーカイブカード、区切り線 |

**GitHub リポジトリーカード**：

::ghcard{repo="ggml-org/llama.cpp"}

**ストリーミングブロック**：

::stream{id="welcome"}

## エディトリアルコンポーネント

以下の完全なキットは、`site.yaml` の `editorial_blocks` から `::editorial{id="features"}` で埋め込まれています。アクション、番号付きリストカード、タイル、アーカイブカード、区切り線を網羅しています：

::editorial{id="features"}

連絡先カード、QR モーダル、ライト／ダークテーマ、言語スイッチャー、バックグラウンドミュージック、画像ライトボックス、スクロールリビールはグローバルコンポーネントです。このページを操作して試してみてください。

| グローバルコンポーネント | 入口 |
|------------------|-------------|
| 連絡先カード / QR モーダル | 右下のカード。クリックで QR モーダルを表示 |
| テーマ切替 | 右上の太陽／月ボタン |
| 言語スイッチャー | 右上の言語ボタン |
| BGM 切替 | 右上の再生／一時停止ボタン |
| ライトボックス | 本文中の画像をクリック |
| スクロールリビール | ページのスクロールに合わせてブロックが出現 |

ホームページ専用のプロフィールブロック、GitHub ブロック、RSS ブロックも以下に完全にレンダリングされています。これらはホームページレイアウトに依存しません。

## ページコントロール

ページコントロールはページ単位で設定されるページレベルのウィジェットです（グローバルではありません）。各ページは frontmatter で独立に定義でき、ページを開き直すたびに再表示され、ページ固有のお知らせや操作を提供します。

| ページコントロール | 設定 | 説明 |
|--------------|---------------|-------------|
| 通知バナー | frontmatter で `notice: "..."` または `notice: { text: "...", color: "yellow" }` を設定 | ページ読み込みから 0.5 秒後にポップイン。4 種のカラーモード（`accent`、`yellow`、`red`、`custom`）に対応。ページ固有で訪問ごとに再表示。✕ をクリックして手動で閉じる。インラインリンクと書式をサポート |
| 目次 (TOC) | frontmatter で `toc: true` を設定 | デスクトップでは右側に固定され ScrollSpy で現在の見出しを追跡。モバイルでは折りたたみ式ドロワーとして表示 |
| 読書プログレスバー (Reading Progress Bar) | frontmatter で `reading_progress: true` を設定 | 画面上部に 2px の細線プログレスバーを配置し、スクロールに応じてリアルタイムで読書進捗を表示。この機能ページでも現在有効化されています |

> 💡 例：このサイトの[ホームページ](/)には、読み込みから 0.5 秒後に表示される目立つ黄色の通知バナー（`notice: { text: "これはデモページです。内容はプロジェクト機能の展示のみを目的としています。", color: "yellow" }`）が設置されています。

## 生 HTML の混在

<mark>この行はネイティブ HTML の mark タグを使っています</mark>。`<script>` のような危険なタグはホワイトリストでフィルタリングされます。


## Callout & Timeline

P0 のコンテンツディレクティブは実行時にスクリプトを追加しません。Callout は説明と警告、Timeline は学歴・経歴・マイルストーンに使います。

:::note{title="再現可能な入口"}
論文、ツール、実験記録を同じインデックスに残します。
:::

:::tip{title="性能の境界"}
新しいコンテンツディレクティブはビルド時に描画され、初画面の JavaScript を増やしません。
:::

:::warning{title="慎重な結論"}
単一のベンチマークスコアは分布報告の代わりになりません。
:::

:::quote{title="Field Note" source="Zhiyuan Lin, 2026"}
システム最適化の価値は、再現できる測定にあります。
:::

::::timeline{title="Education & Experience"}
:::timeline-item{start="2022" end="2026" title="PhD Candidate" org="Example University" url="/research" highlight="true"}
機械学習とシステム、特に推論スケジューリングと再現可能な評価を研究。
:::
:::timeline-item{start="2026" title="Research Intern" org="Example Lab"}
エッジデバイスでの LLM 推論実験に参加。
:::
::::

## 论文リスト

`data/publications.yaml` が権威あるデータソースで、`publications.bib` がキーごとに元の BibTeX を提供します。絞り込み・並べ替え・グループ化はビルド時に完了します。

::publications{tag="systems" limit="3" group="year" sort="date-desc"}


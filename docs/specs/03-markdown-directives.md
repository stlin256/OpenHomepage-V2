# markdown 自定义指令语法（细化项 #3）

> 状态：待讨论确认。基于 remark-directive 生态实现，与标准 GFM / Shiki / HTML 混写共存。

## 1. 内嵌播放器

```markdown
::bilibili{bvid="BV1xx411c7mD"}
::youtube{id="dQw4w9WgXcQ"}
:::video{src="assets/demo.mp4" poster="assets/cover.png"}
:::
:::audio{src="assets/podcast.mp3"}
:::
```

- `bilibili` / `youtube` 渲染为响应式 16:9 iframe，**默认懒加载**（点击封面才加载 iframe，减轻页面开销、避免第三方追踪）。
- `video` / `audio` 渲染原生 `<video controls>` / `<audio controls>`，src 支持相对 data/ 的路径和外部 URL。

## 2. 图文排版（杂志化用）

```markdown
:::figure{src="assets/photo.jpg" caption="图 1：实验装置" width="70%"}
:::

:::grid{cols=2}
:::cell
左栏内容 markdown……
:::
:::cell
右栏内容 markdown……
:::
:::
```

- `figure`：带图注的图片块，可指定宽度。
- `grid` / `cell`：多栏排版容器，栏内仍是完整 markdown。移动端自动塌缩为单列。

## 3. 功能指令

```markdown
::stream{id="welcome"}
::ghcard{repo="owner/repo"}
```

- `stream`：在任意页面嵌入已定义的流式区块（引用 site.yaml 的 streaming_blocks）。
- `ghcard`：在正文任意位置嵌入单个 GitHub 仓库卡片。

## 4. 注意事项

- 指令参数一律用 `key="value"` 形式；未识别指令按普通文本段落降级渲染，不报错。
- 编辑器（Milkdown）为这些指令提供自定义节点，保持所见即所得。
- 所有指令渲染结果在明暗双主题下均需成立。
- 数学公式：KaTeX 渲染，`$...$` 行内与 `$$...$$` 块级；KaTeX CSS 仅按需加载。

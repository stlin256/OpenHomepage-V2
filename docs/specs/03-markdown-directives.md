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

- `bilibili` / `youtube` **直接渲染**官方播放器 iframe（`<div class="embed-player">` 响应式 16:9 容器 + `<iframe loading="lazy">`，浏览器视口附近才加载，不拖慢首屏）。YouTube 嵌入 URL 用隐私增强域名 `youtube-nocookie.com`。
- `video` / `audio` 渲染原生 `<video controls>` / `<audio controls>`，src 支持相对 data/ 的路径和外部 URL。版式与 figure/embed-player 一致：块级、杂志全宽（`width:100%`、1.5em 上下间距），video 带与 embed-player 同款的底色/描边/圆角。

## 2. 图文排版（杂志化用）

```markdown
:::figure{src="assets/photo.jpg" caption="图 1：实验装置" width="70%" align="center"}
:::

::::grid{cols=2}
:::cell
左栏内容 markdown……
:::
:::cell
右栏内容 markdown……
:::
::::
```

- `figure`：带图注的图片块，可指定 `width`（`%/px/em/rem/vw`）与 `align`（`left/center/right`， margin 内联样式实现；非法值忽略）。
- `grid` / `cell`：多栏排版容器，栏内仍是完整 markdown。移动端自动塌缩为单列。
- 嵌套容器指令时**外层冒号数必须多于内层**（如 `::::grid` 包 `:::cell`），否则内层的闭合 `:::` 会提前结束外层指令（remark-directive 解析规则）。
  - 管线容错：误嵌套时多余的闭合围栏会被 remark-directive 解析成纯冒号文本段落（如 `<p>:::</p>`，在网格中显示为图片间的残留符号）；渲染管线直接移除这类纯冒号段落（正文正常内容不受影响）。

## 3. 功能指令

```markdown
::stream{id="welcome"}
::ghcard{repo="owner/repo"}
```

- `stream`：在任意页面嵌入已定义的流式区块（引用 site.yaml 的 streaming_blocks）。
- `ghcard`：在正文任意位置嵌入单个 GitHub 仓库卡片。

## 4. 图片灯箱

正文与 grid 内的所有图片（figure 与普通 markdown 图片）点击后打开全屏灯箱：深色背景 + 居中放大图，开/关带缩放 + 淡入淡出动画（250ms，统一缓动 `cubic-bezier(0.22, 1, 0.36, 1)`；reduced-motion 时去掉缩放只留淡入）。关闭方式：✕ 按钮、点击背景、Esc。灯箱内是原生 `<img>`，右键"图片另存为"与移动端长按下载均可用。

**高分辨率约定**：同名 `-full` 后缀文件为高清版（`assets/hero.jpg` → `assets/hero-full.jpg`）。灯箱运行时乐观加载高清版，404 时回退原图（失败结果会话内缓存，不重复请求）。推导与选用逻辑在 `src/lib/lightbox.ts`（纯函数，有单测）；交互在 `src/scripts/lightbox.ts`（事件委托，ClientRouter 转场无需重绑；链接/按钮内的图片不劫持）。灯箱骨架由 BaseLayout 服务端渲染（无 JS 时无影响）。

## 5. 注意事项

- 指令参数一律用 `key="value"` 形式；未识别指令按普通文本段落降级渲染，不报错。
- 编辑器（Milkdown）为这些指令提供自定义节点，保持所见即所得。
- 所有指令渲染结果在明暗双主题下均需成立。
- 数学公式：KaTeX 渲染，`$...$` 行内与 `$$...$$` 块级；KaTeX CSS 仅按需加载。

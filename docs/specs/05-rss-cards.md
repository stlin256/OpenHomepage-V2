# RSS 卡片细节（细化项 #5）

> 状态：**已实现（M4b）**。视图模型 `src/lib/rss-block.ts`，组件 `src/components/blocks/RssBlock.astro` /
> `RssCard.astro`，浮层交互 `src/scripts/rss-popover.ts` + 纯逻辑 `src/lib/interactive.ts`（TDD 覆盖）。

## 卡片字段

| 字段 | 来源 | 说明 |
|------|------|------|
| 标题 | feed entry title | 最多 2 行，超出省略 |
| 来源名 | sources[].name | 小字标签 |
| 发布时间 | entry published | 格式 `2026-08-22`，相对时间 hover 提示完整时间 |
| 摘要 | entry summary 截取 | 默认 120 字符，构建时固化 |
| 封面图 | feed 条目 enclosure/og:image（可选） | 有则显示缩略图，无则纯文字卡片 |
| note | rss.yaml articles[].note | curated 模式的推荐语，斜体小字 |

## hover 预览浮层

- hover 卡片 300ms 后浮出预览层：完整标题 + 摘要全文（≤300 字）+ 发布时间 + 来源。
- 浮层方向基于卡片在视口中的位置：默认弹向卡片**上方**，上方空间不足才翻转到下方；两侧都放不下时放在空间较大一侧并收缩高度（内部滚动），不脱离卡片、不被视口截断。离开卡片或浮层 150ms 后收起。
- 移动端无 hover：点击卡片第一下展开预览，第二下跳原文（或浮层内"阅读原文"按钮）。

## curated 模式编排

- articles 列表顺序即展示顺序（不按时间重排），用户通过列表顺序 + note 实现"按某格式编排"。
- grouped 显示模式下，curated 源与其他源一样是一个栏目。

## 待定问题

- ~~封面图：是否抓取条目图片做卡片缩略图？~~ **已定：不自动抓取。** 封面由用户在 rss.yaml 中声明：
  - 源级别可选 `cover:`（该源所有卡片的默认封面）；
  - curated 模式的每个 article 可单独声明 `cover:`（覆盖源默认）；
  - 值为 data/ 内本地路径或外部 URL；未声明则渲染纯文字卡片。

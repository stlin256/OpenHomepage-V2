# RSS 卡片细节（细化项 #5）

> 状态：**已实现（M4b）**，2026-08-23 修订：**hover 预览浮层按用户要求移除**——卡片即链接，点击直达原文。
> 视图模型 `src/lib/rss-block.ts`，组件 `src/components/blocks/RssBlock.astro` / `RssCard.astro`。

## 卡片字段

| 字段 | 来源 | 说明 |
|------|------|------|
| 标题 | feed entry title | 最多 2 行，超出省略 |
| 来源名 | sources[].name | 小字标签 |
| 发布时间 | entry published | 格式 `2026-08-22`，悬停 title 提示完整时间 |
| 摘要 | entry summary 截取 | 默认 120 字符，构建时固化 |
| 封面图 | feed 条目 enclosure/og:image（可选） | 有则显示缩略图，无则纯文字卡片 |
| note | rss.yaml articles[].note | curated 模式的推荐语，斜体小字 |

## hover 预览浮层（已移除）

- ~~hover 卡片 300ms 后浮出预览层~~ 用户实测观感不佳，已取消；桌面/移动端行为统一为点击直达原文。

## curated 模式编排

- articles 列表顺序即展示顺序（不按时间重排），用户通过列表顺序 + note 实现"按某格式编排"。
- grouped 显示模式下，curated 源与其他源一样是一个栏目。

## 待定问题

- ~~封面图：是否抓取条目图片做卡片缩略图？~~ **已定：不自动抓取。** 封面由用户在 rss.yaml 中声明：
  - 源级别可选 `cover:`（该源所有卡片的默认封面）；
  - curated 模式的每个 article 可单独声明 `cover:`（覆盖源默认）；
  - 值为 data/ 内本地路径或外部 URL；未声明则渲染纯文字卡片。

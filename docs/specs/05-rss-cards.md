# RSS 卡片细节（细化项 #5）

> 状态：**已实现（M4b）**，2026-08-23 修订：**hover 预览浮层按用户要求移除**——卡片即链接，点击直达原文。
> 视图模型 `src/lib/rss-block.ts`，组件 `src/components/blocks/RssBlock.astro` / `RssCard.astro`。

## 卡片字段

| 字段 | 来源 | 说明 |
|------|------|------|
| 标题 | feed entry title | 最多 2 行，超出省略 |
| 来源名 | sources[].name | 小字标签；支持多语言映射，按页面语言解析 |
| 发布时间 | entry published | 格式 `2026-08-22`，悬停 title 提示完整时间 |
| 摘要 | entry summary 截取 | 默认 120 字符，构建时固化 |
| 封面图 | 声明的 cover，或 curated 条目文章页 og:image | 有则显示缩略图，无则纯文字卡片；外链加载失败前端隐藏图位 |
| note | rss.yaml articles[].note | curated 模式的推荐语，斜体小字；支持多语言映射，按页面语言解析 |

## hover 预览浮层（已移除）

- ~~hover 卡片 300ms 后浮出预览层~~ 用户实测观感不佳，已取消；桌面/移动端行为统一为点击直达原文。

## curated 模式编排

- articles 列表顺序即展示顺序（不按时间重排），用户通过列表顺序 + note 实现"按某格式编排"。
- grouped 显示模式下，curated 源与其他源一样是一个栏目。

## 待定问题

- ~~封面图：是否抓取条目图片做卡片缩略图？~~ **已定（2026-08-23 修订）**：
  - 显式声明优先：源级别可选 `cover:`（该源所有卡片的默认封面）；curated 模式的每个 article 可单独声明 `cover:`（覆盖源默认）；值为 data/ 内本地路径或外部 URL；
  - **curated 条目未显式声明 cover 时**，prefetch 抓文章页提取 `og:image`（回退：`twitter:image` → 正文首个 `<img>`，相对地址按文章 URL 解析为绝对 URL）作为封面；feed 命中的条目也会为封面补抓文章页，补抓失败不致命（保留 feed 数据，封面置空）；
  - 封面存外链 URL（不下载本地化）；前端加载失败时隐藏图位（捕获阶段 error 委托，见 src/scripts/interactions.ts）。

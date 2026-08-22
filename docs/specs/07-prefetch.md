# prefetch 数据获取与缓存（细化项 #7）

> 状态：待讨论确认。运行时机已定：构建前执行 `scripts/prefetch.mjs`，输出 JSON 供 Astro 构建读取。

## 1. 缓存文件结构（.cache/）

```
.cache/
├── github.json       # 用户信息、pin 仓库、贡献图
├── rss.json          # 所有源的条目与摘要
└── meta.json         # 各数据块的时间戳与状态
```

`github.json`：

```json
{
  "user":        { "data": {...}, "fetched_at": 169..., "error": null },
  "pinned":      { "data": [ {repo...} ], "fetched_at": 169..., "error": null },
  "contributions": { "data": {total, weeks}, "fetched_at": 169..., "error": null }
}
```

`rss.json`：

```json
{
  "sources": [
    {
      "name": "...", "mode": "latest",
      "entries": [ { "title", "link", "published", "summary", "cover", "note" } ],
      "fetched_at": 169..., "error": null
    }
  ]
}
```

## 2. 抓取逻辑

- **GitHub 用户/pin 仓库**：REST API；有 token 带 token，无则匿名（60 次/时，本地开发够用；CI 用 `GH_PAT`）。
- **贡献图**：GraphQL `contributionsCollection`，必须 `GH_PAT`；本地无 PAT 时该区块渲染为"本地预览不可用"占位（不报错）。
- **RSS**：
  - latest 模式：解析 feed 取前 N 条，摘要截 300 字符；
  - curated 模式：按 articles 列表逐条处理——能匹配到 feed 内条目就用 feed 数据；匹配不到则抓取文章页取标题/摘要（复用旧项目的正文抓取思路，仅取 meta/前 300 字，不做全文本地化）；
  - 单源失败不影响其他源。
- 并发：源之间并发（上限 4），单源内串行，总超时保护 60s。

## 3. 缓存策略

- TTL：正常 1 小时内不重复抓取；上次失败的数据块 15 分钟后才重试。
- 降级：本次抓取失败 → 用缓存中的旧数据，`error` 字段记录原因，构建照常；无任何缓存时对应区块隐藏（rss）或显示占位（github）。
- `--force` 参数忽略 TTL 强制全量抓取（CI 每次用 `--force`，保证每日定时部署数据新鲜）。

## 4. 输出给 Astro

- 构建时 Astro 直接 import `.cache/*.json`（gitignored）。
- **缺数即报错**（用户已确认）：`.cache/` 数据完全不可用（无任何旧缓存）时 `astro build` 直接失败，不静默出残版。CI 上配合快照回退逻辑——只有"在线源失效 + 无历史快照"（如首次部署）才会真正失败，此时收到 GitHub 失败邮件。
- 例外：贡献图单块在**本地开发无 PAT** 时仍渲染占位提示（不阻断本地预览）；CI 上 PAT 缺失则视为缺数报错。

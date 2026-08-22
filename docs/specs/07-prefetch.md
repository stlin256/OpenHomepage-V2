# prefetch 数据获取与缓存（细化项 #7）

> 状态：**已实现（M3）**。核心逻辑在 `src/lib/prefetch.ts`（纯 Node、fetch/时钟可注入、TDD 覆盖），
> CLI 入口 `scripts/prefetch.ts`，经 `npm run prefetch [-- --force]`（tsx）运行。
> 构建前执行，输出 `.cache/*.json` 供 Astro 构建读取。

## 1. 缓存文件结构（.cache/）

```
.cache/
├── github.json       # 用户信息、pin 仓库、贡献图
├── rss.json          # 所有源的条目与摘要
└── meta.json         # 各数据块的时间戳与状态汇总
```

每个数据块统一为：

```json
{ "data": ..., "fetched_at": 169..., "error": null, "failed_at": null }
```

- `fetched_at`：数据**成功获取**的时间；失败降级时保留旧值（渲染端据此显示真实数据年龄）。
- `failed_at`：最近一次抓取失败时间，15min 失败退避的依据。
- `error`：最近一次失败原因（含部分失败），成功时为 null。

`github.json`：

```json
{
  "user":          { "data": {...}, "fetched_at": 169..., "error": null, "failed_at": null },
  "pinned":        { "data": [ {repo..., "note"} ], "fetched_at": 169..., "error": null, "failed_at": null },
  "contributions": { "data": {"total": 0, "weeks": []}, "fetched_at": 169..., "error": null, "failed_at": null }
}
```

REST 响应只保留白名单字段（用户：login/name/avatar_url/bio/company/blog/location/followers 等；
仓库：name/full_name/description/html_url/language/stargazers_count/forks_count/pushed_at/topics 等），
pinned 条目并入 site.yaml 的 `note`（无则 null）。

`rss.json`：

```json
{
  "sources": [
    {
      "name": "...", "url": "...", "mode": "latest",
      "entries": [ { "title", "link", "published", "summary", "cover", "note" } ],
      "fetched_at": 169..., "error": null, "failed_at": null
    }
  ]
}
```

- `url` 用于缓存匹配（键 = name + url），sources 顺序与 rss.yaml 一致。
- `published` 归一化为 ISO 字符串，无法解析为 null；`cover`/`note` 无声明为 null。
- 摘要去 HTML 标签、解码实体、压缩空白后按码点截 300 字符；
  字段选择顺序 `content:encoded` → `content` → `summary` → `contentSnippet`。

`meta.json`：

```json
{
  "updated_at": 169...,
  "ok": true,
  "blocks": [ { "key": "github.user", "status": "fresh", "error": null } ]
}
```

`status` 枚举：`fresh`（本次抓取成功）/ `cached`（TTL 命中）/ `stale`（失败降级旧缓存）/
`partial`（部分条目失败，数据已写盘）/ `placeholder`（本地无 PAT 的贡献图占位）/ `error`（失败且无缓存）。
块 key：`github.user` / `github.pinned` / `github.contributions` / `rss.<源名>`。

## 2. 抓取逻辑

- **GitHub 用户/pin 仓库**：REST API；token 按 `GH_PAT` → `GITHUB_TOKEN` → `GH_TOKEN` 顺序取，
  有则带 `Authorization: Bearer`，无则匿名（60 次/时，本地开发够用；CI 用 `GH_PAT`）。
- **贡献图**：GraphQL `contributionsCollection`，必须 token；本地无 PAT 时该块写 `placeholder`
  状态（有旧缓存则原样保留），不报错。
- **RSS**：
  - latest 模式：解析 feed 取前 N 条（`latest` 缺省 5），摘要截 300 字符；
  - curated 模式：按 articles 列表逐条处理——feed 内按 link 匹配（忽略末尾斜杠）命中则用
    feed 数据；匹配不到则抓文章页，标题取 `og:title` → `<title>`，摘要取 meta description →
    `og:description` → 首段有实质内容（≥40 字符）的 `<p>`，截 300 字；不做全文本地化；
  - 文章页也失败 → 该条降级为占位条目（title=URL、空摘要），源记 `partial`；feed 与文章页
    全灭才视为整源失败，走缓存降级；
  - 封面不抓图：`article.cover` ?? 源级 `cover` ?? null；
  - 单源失败不影响其他源。
- 并发：所有数据块共用同一限制器（上限 4），单源内串行；单请求超时 15s，总超时 60s，
  超时的块按普通失败走降级。
- feed 解析用 `rss-parser`（xml2js 系，RSS 2.0/Atom 归一化）； prefetch 侧 fetch 拿到 XML 文本
  后 `parseString` 解析，不发自己的请求。

## 3. 缓存策略

- TTL：正常 1 小时内不重复抓取；上次失败（含 partial）的数据块 15 分钟后才重试。
- 降级：本次抓取失败 → 用缓存中的旧数据，`error` 字段记录原因、更新 `failed_at`，构建照常；
  无任何缓存时对应区块隐藏（rss）或显示占位（github）。
- `--force` 参数忽略 TTL 与失败退避，强制全量抓取（CI 每次用 `--force`，保证每日定时部署数据新鲜）。
- 缓存写盘为原子写（临时文件 + rename），避免构建读到半截 JSON。

## 4. 输出给 Astro

- 构建时 Astro 直接 import `.cache/*.json`（gitignored）。
- **缺数即报错**（用户已确认）：所有数据块都失败且无任何旧缓存时，prefetch 以非零退出码结束，
  `astro build` 直接失败，不静默出残版。判定口径：存在任一 `fresh`/`cached`/`stale`/`partial`
  块 → 零退出 + warning 列出异常块；`placeholder` 是中性块，既不算失败也不构成"有数据"。
  CI 上配合快照回退逻辑——只有"在线源失效 + 无历史快照"（如首次部署）才会真正失败，
  此时收到 GitHub 失败邮件。
- 例外：贡献图单块在**本地开发无 PAT** 时仍渲染占位提示（`placeholder`，不阻断本地预览）；
  CI 上 PAT 缺失则该块视为失败（`error`），计入缺数判定。

## 5. 构建侧读取行为（M4b 决策）

Astro 构建读 `.cache/*.json` 时的降级规则（报错闸口在 prefetch，构建侧**不崩**）：

- 缓存文件**整体缺失/损坏**（从未 prefetch）：warning 提示先跑 `npm run prefetch`，
  GitHub / RSS 区块渲染**空态提示**（方便本地开发定位原因）。
- 缓存文件存在但**全部源/块无条目**（抓取降级且无旧缓存）：GitHub 对应部分隐藏、
  RSS 整区隐藏（§3 降级规则的构建侧体现），不显示空态文案。
- 块 `error` 非空但有旧数据（stale）：照常渲染 + 不显眼的小字"数据更新于 {fetched_at}"。

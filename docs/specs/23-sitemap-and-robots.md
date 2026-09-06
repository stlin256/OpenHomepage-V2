# 23：自动化 Sitemap.xml 与 Robots.txt（规格）

> 状态：已实现。
> 来源：SEO、学术传播与现代 Web 标准增强路线（一之 1）。
> 目标：在构建期全自动生成完全合规、适配多语言双向关联（`xhtml:link hreflang`）的 `sitemap.xml` 与动态指向站点地图的 `robots.txt`，保证全站静态可预测、零前端运行时 JS 开销。
> 全局约束：零新增运行时依赖；产物符合 Sitemaps.org 与 Google Search Console 官方规范；严格支持 `data/` 多语言路由与 `x-default` 回退链；按 TDD 实施，单测覆盖率严格满足门槛（lines/statements/functions ≥90%、branches ≥80%）。

---

## 1. 用户目标与价值

1. **搜索引擎全覆盖与权重收敛**：
   - 自动收录站点内全部多语言有效页面（包括根首页与 `/en/`、`/ja/`、`/fr/` 等子路径页面）。
   - 为每个页面声明双向 `<xhtml:link rel="alternate" hreflang="..." />` 关系及 `x-default` 回退，消除多语言内容在 Google、Bing、Baidu 等搜索引擎中的“重复内容”惩罚与权重稀释。

2. **爬虫行为引导与收录效率**：
   - 生成标准 `robots.txt`，显式声明 `Sitemap: <canonical_url>/sitemap.xml`，引导合规搜索引擎爬虫快速发现站点更新。
   - 允许站长在 `site.yaml` 中配置爬虫规则（如屏蔽私有资产路径、测试页面或爬虫白名单/黑名单）。

3. **零心智负担与开箱即用**：
   - 纯构建期生成（Astro Static Endpoint），新增/删除 Markdown 页面、变更多语言配置、调整首页区块时，`sitemap.xml` 随 `npm run build` 自动同步，无需手动维护。

---

## 2. 架构设计与生成管线

### 2.1 模块分层与代码组织

```
src/
├── lib/
│   ├── sitemap.ts            # Sitemap XML 构建纯函数（路由提取、URL 规范化、多语言 alternate 映射、XML 序列化）
│   └── robots.ts             # Robots.txt 构建纯函数（User-agent 分组、Allow/Disallow 解析、Sitemap 声明）
└── pages/
    ├── sitemap.xml.ts        # Astro 静态端点：调用 buildSitemapXml() 并返回 application/xml
    └── robots.txt.ts         # Astro 静态端点：调用 buildRobotsTxt() 并返回 text/plain
```

### 2.2 触发时机与数据流

1. **构建触发**：在 `astro build` 静态生成阶段，Astro 自动执行 `src/pages/sitemap.xml.ts` 与 `src/pages/robots.txt.ts` 的 `GET` 路由处理器。
2. **数据源采集**：
   - `loadDataDir()` / `resolveDataDir()`：读取 `data/`（缺失时回退 `data.example/`）。
   - `loadSiteConfig()`：读取 `site.yaml` 获取站点基本信息、语言配置与 SEO 配置。
   - `loadPages()`：扫描 `data/pages/<lang>/*.md` 获取全部页面 Markdown frontmatter 及文件状态。
   - `buildRoutes()`（复用 `src/lib/routes.ts`）：获取系统计算后的标准化路由表（Path、Lang、Slug、Nav 状态）。
3. **文件修改时间计算（Lastmod）**：
   - 优先读取 Markdown frontmatter 中的 `updated` 或 `date` 字段（ISO-8601 格式，如 `2026-09-06`）。
   - 次选读取本地文件的 Git commit 时间或文件系统 `mtime`。
   - 兜底使用当次构建时间（`YYYY-MM-DD`）。
4. **URL 绝对化与 Base 处理**：
   - 规范化基准域名（Canonical Site URL）：优先使用 `site.yaml` 中的 `site.url`；若未显式指定，使用 `astro.config.mjs` 中的 `site` 或环境变量注入的域名。
   - 路径拼接通过 `getBaseUrl()` 考虑 Astro `base` 配置（例如 GitHub Pages 子目录 `/OpenHomepage-V2/`）。

---

## 3. 配置模型（Config Schema）

在 `data/site.yaml` 的 `site:` 或新增 `seo:` 节点中扩展配置项（全部具备安全默认值，缺省时不破坏现有配置）：

```yaml
# ---- SEO 与爬虫配置（可选）----
seo:
  sitemap:
    enabled: true                  # 是否生成 sitemap.xml（默认 true）
    changefreq: "weekly"          # 默认更新频率：always | hourly | daily | weekly | monthly | yearly | never
    priority:                     # 权重映射配置（可选）
      home: 1.0                   # 首页权重（默认 1.0）
      pages: 0.8                  # 普通页面权重（默认 0.8）
  robots:
    enabled: true                  # 是否生成 robots.txt（默认 true）
    allow: ["/"]                  # 允许抓取的路径列表（默认 ["/"]）
    disallow: []                  # 禁止抓取的路径列表（例如 ["/assets/private/"]）
    crawl_delay: null             # 爬虫延迟（秒，可选）
```

### 3.1 页面级 Frontmatter 覆盖

在 `data/pages/<lang>/<slug>.md` 的 frontmatter 中支持独立控制单个页面的收录行为：

```yaml
---
title: "内部测试页面"
sitemap: false      # 设为 false 时，该页面从 sitemap.xml 中完全排除
changefreq: "monthly" # 覆盖全局默认 changefreq
priority: 0.5       # 覆盖全局默认 priority
---
```

---

## 4. 输出规范与格式标准

### 4.1 `sitemap.xml` 产物结构

严格遵循 Sitemaps XML 协议 0.9 以及 Google 多语言注解规范（`xmlns:xhtml="http://www.w3.org/1999/xhtml"`）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <!-- 默认语言首页 -->
  <url>
    <loc>https://stlin256.github.io/OpenHomepage-V2/</loc>
    <lastmod>2026-09-06</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="zh" href="https://stlin256.github.io/OpenHomepage-V2/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://stlin256.github.io/OpenHomepage-V2/en/" />
    <xhtml:link rel="alternate" hreflang="ja" href="https://stlin256.github.io/OpenHomepage-V2/ja/" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://stlin256.github.io/OpenHomepage-V2/fr/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://stlin256.github.io/OpenHomepage-V2/" />
  </url>
  <!-- 英文语言首页 -->
  <url>
    <loc>https://stlin256.github.io/OpenHomepage-V2/en/</loc>
    <lastmod>2026-09-06</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="zh" href="https://stlin256.github.io/OpenHomepage-V2/" />
    <xhtml:link rel="alternate" hreflang="en" href="https://stlin256.github.io/OpenHomepage-V2/en/" />
    <xhtml:link rel="alternate" hreflang="ja" href="https://stlin256.github.io/OpenHomepage-V2/ja/" />
    <xhtml:link rel="alternate" hreflang="fr" href="https://stlin256.github.io/OpenHomepage-V2/fr/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://stlin256.github.io/OpenHomepage-V2/" />
  </url>
  <!-- 普通页面（如 /about） -->
  <url>
    <loc>https://stlin256.github.io/OpenHomepage-V2/about</loc>
    <lastmod>2026-09-05</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="zh" href="https://stlin256.github.io/OpenHomepage-V2/about" />
    <xhtml:link rel="alternate" hreflang="en" href="https://stlin256.github.io/OpenHomepage-V2/en/about" />
    <xhtml:link rel="alternate" hreflang="x-default" href="https://stlin256.github.io/OpenHomepage-V2/about" />
  </url>
</urlset>
```

#### 关键约束：
1. **XML 实体安全转义**：URL 中的 `&`、`'`、`"`、`<`、`>` 必须严格转义（如 `&amp;`）。
2. **多语言对齐**：每个 URL 节点必须包含该路由在站点全部可用语言下的对等镜像链接，且必须包含一条指向默认语言（或全局回退页）的 `hreflang="x-default"` 声明。
3. **单语言站点退化**：当站点为单语言（`i18n: false` 或仅 1 种语言）时，省略 `<xhtml:link>` 标签，输出精简标准的 Sitemaps 0.9 格式。

### 4.2 `robots.txt` 产物结构

输出 MIME 类型为 `text/plain; charset=utf-8`：

```txt
# Robots.txt generated automatically by OpenHomepage-V2
User-agent: *
Allow: /

# Sitemaps
Sitemap: https://stlin256.github.io/OpenHomepage-V2/sitemap.xml
```

#### 关键约束：
1. 若 `seo.robots.disallow` 配置了目录（例如 `disallow: ["/assets/private/"]`），则自动生成对应 `Disallow: /assets/private/` 行。
2. 若 `seo.sitemap.enabled` 为 `false`，则不输出 `Sitemap:` 指令。

---

## 5. 边界处理与降级策略

| 异常/边界场景 | 处理策略 |
| :--- | :--- |
| **未配置 `site.url` 且无 `Astro.site`** | 降级使用相对路径或警告提示，本地开发与 CI 环境在无域名输入时返回相对规范格式或输出可预测 fallback，避免构建崩溃。 |
| **Markdown 页面缺少 `updated`/`date`** | 尝试获取文件系统 `mtime`；若处于无 git 信息的 CI 容器，安全回退到当前日期（`YYYY-MM-DD`）。 |
| **存在被 `sitemap: false` 排除的页面** | 不出现在 `<url>` 列表中，且该页面的其它语言对等项在生成 `<xhtml:link>` 时也相应剔除该项。 |
| **单页多语言缺失（依赖 fallback 语言）** | 仍将该语言路径列入 sitemap（因为 Astro 动态路由已生成对应的 fallback HTML 页面），确保搜索蜘蛛能抓到 fallback 内容。 |

---

## 6. 测试矩阵与验收门槛

### 6.1 单元测试（`tests/sitemap.test.ts` & `tests/robots.test.ts`）
1. **纯函数生成测试**：
   - 验证单语言与多语言路由下生成的 XML 节点数量、格式、`<loc>` 与 `<xhtml:link>` 正确性。
   - 验证 `x-default` 指向默认语言路由。
   - 验证特殊字符 URL（中文 slug、空格、查询参数）转义合规性。
   - 验证 `sitemap: false` 过滤机制。
   - 验证 `robots.txt` 规则解析、自定义 Allow/Disallow 与 Sitemap 链接拼装。
2. **构建产物断言**：
   - 执行 `npm run build` 后，断言 `dist/sitemap.xml` 与 `dist/robots.txt` 存在且格式正确。
   - 验证 XML 可被标准 DOMParser / fast-xml-parser 正常解析，无语法错误。

### 6.2 质量指标
- 单元测试覆盖率严格达标（Lines ≥90%、Branches ≥80%）。
- 零运行时客户端 JS，构建耗时增加不超过 50ms。

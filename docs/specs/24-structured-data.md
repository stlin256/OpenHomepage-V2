# 24：学术与个人结构化数据（Schema.org / JSON-LD）（规格）

> 状态：已实现。
> 来源：SEO、学术传播与现代 Web 标准增强路线（一之 2）。
> 目标：在构建期自动为首页、普通文章页及学术成果生成合规的 Schema.org JSON-LD 结构化数据，嵌入 `<head>` 的 `<script type="application/ld+json">` 中，帮助 Google、Google Scholar、Bing 等搜索引擎精准识别学者身份、学术论文元数据及原创文章，赋予站点顶级富摘要（Rich Snippets）与知识图谱呈现能力。
> 全局约束：零前端运行时 JS；零外部 schema 库依赖（纯原生 TypeScript 序列化）；严格防范 JSON 脚本注入（XSS 防护）；与 `data/site.yaml`、`data/publications.yaml` 及 `data/pages/*.md` 紧密绑定；按 TDD 实施，测试覆盖率严格达标（lines/statements/functions ≥90%、branches ≥80%）。

---

## 1. 用户目标与价值

1. **学者知识图谱与个人名片富摘要（Google Knowledge Graph / Bing Rich Card）**：
   - 当搜索学者姓名时，搜索引擎可直接在搜索结果右侧或卡片中提取个人姓名、职位/头衔、所属机构、头像、个人网站、GitHub、Google Scholar、ORCID 等社交与学术链接。

2. **学术成果收录与引用追踪（Google Scholar & Academic Search Engines）**：
   - 针对论文、预印本、期刊与会议报告，输出 `ScholarlyArticle` 结构化实体，清晰传递论文标题、作者完整排序列表（突出作者贡献）、发表年份/日期、会议/期刊名称（Venue）、DOI 唯一定位符、摘要及 PDF/代码直链，极大提升学术搜索引擎的自动收录与引用识别率。

3. **文章与页面索引优化（Article / BlogPosting）**：
   - 为站内博客、研究笔记与内容页面注入标准文章结构化数据，展示准确的发布日期、更新时间、作者归属与封面图，提升点击率。

---

## 2. 架构设计与生成管线

### 2.1 模块分层

```
src/
├── lib/
│   └── jsonld.ts             # JSON-LD 纯函数生成层（Schema 构造、字段解析、多语言提取、JSON 序列化与 XSS 转义）
└── layouts/
    └── BaseLayout.astro      # <head> 内嵌入预渲染好的 JSON-LD script 标签
```

### 2.2 数据流与执行时机

1. **构建期计算**：在 `src/pages/[...slug].astro` 的 `getStaticPaths` 或渲染阶段，根据当前路由类型（首页、学术成果页、常规文章页）收集数据。
2. **纯数据输入**：将已解析的 `SiteConfig`、`PageEntry`、`PublicationsConfig`、当前语言 `lang` 与页面 URL 传给 `buildJsonLd(options)`。
3. **输出注入**：`buildJsonLd` 返回经过安全转义的 JSON-LD 对象（或 JSON-LD 对象数组）。`BaseLayout.astro` 直接渲染：
   ```html
   <script type="application/ld+json" set:html={jsonLdString} />
   ```
4. **运行时零开销**：客户端无需加载任何解析代码，直接作为静态 HTML 输出。

---

## 3. Schema 模型与详细字段映射

### 3.1 首页：`ProfilePage` 与 `Person`

当页面为首页（`route.slug === '/'`）时，生成包含学者个人档案的复合实体：

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://stlin256.github.io/OpenHomepage-V2/#website",
      "url": "https://stlin256.github.io/OpenHomepage-V2/",
      "name": "林知远 · 个人主页",
      "description": "林知远的个人主页：机器学习研究、开源项目与阅读记录",
      "inLanguage": "zh-CN"
    },
    {
      "@type": "ProfilePage",
      "@id": "https://stlin256.github.io/OpenHomepage-V2/#profilepage",
      "url": "https://stlin256.github.io/OpenHomepage-V2/",
      "name": "林知远",
      "isPartOf": { "@id": "https://stlin256.github.io/OpenHomepage-V2/#website" },
      "mainEntity": {
        "@type": "Person",
        "@id": "https://stlin256.github.io/OpenHomepage-V2/#person",
        "name": "林知远",
        "jobTitle": "博士研究生 / 机器学习与系统",
        "image": "https://stlin256.github.io/OpenHomepage-V2/assets/avatar.jpg",
        "url": "https://stlin256.github.io/OpenHomepage-V2/",
        "sameAs": [
          "https://github.com/stlin256",
          "https://scholar.google.com/citations?user=xyz",
          "mailto:zhiyuan@example.com"
        ],
        "knowsAbout": ["Machine Learning", "Distributed Systems", "Inference"]
      }
    }
  ]
}
```

#### 字段映射规则：
| Schema 字段 | 数据来源 | 降级/缺省规则 |
| :--- | :--- | :--- |
| `Person.name` | `site.profile.name[lang]` || `site.profile.name` | 必填 |
| `Person.jobTitle` | `site.profile.tagline[lang]` || `site.profile.tagline` | 无则省略 |
| `Person.image` | `site.profile.avatar` 绝对化 URL | 留空则省略 |
| `Person.sameAs` | `site.profile.links[].url` 数组 + `site.github.username` (拼装 GitHub URL) | 自动去重与过滤空值 |
| `Person.knowsAbout` | 聚合 `publications.yaml` 中所有项的 `tags` 数组（去重） | 无论文配置时省略 |

---

### 3.2 学术成果：`ScholarlyArticle`

当页面包含论文成果（主页挂载了成果区块，或独立学术成果页面，或 Markdown 正文中使用了 `::publications`）时，为列表中的每一篇学术成果生成一个 `ScholarlyArticle` 实体并挂入 `@graph`：

```json
{
  "@type": "ScholarlyArticle",
  "@id": "https://stlin256.github.io/OpenHomepage-V2/#pub-efficient-inference-2026",
  "headline": "Efficient Inference with Adaptive Scheduling",
  "name": "Efficient Inference with Adaptive Scheduling",
  "author": [
    { "@type": "Person", "name": "Zhiyuan Lin" },
    { "@type": "Person", "name": "Alice Doe" },
    { "@type": "Person", "name": "Bob Smith" }
  ],
  "datePublished": "2026-05-12",
  "isPartOf": {
    "@type": "PublicationEvent",
    "name": "OSDI 2026"
  },
  "sameAs": "https://doi.org/10.1145/1234567.890123",
  "identifier": "10.1145/1234567.890123",
  "description": "第一作者，负责调度器设计与评测。",
  "abstract": "We present an adaptive scheduling framework for large-scale model inference...",
  "url": "https://arxiv.org/abs/2605.12345",
  "keywords": ["systems", "inference"]
}
```

#### 字段映射规则：
| Schema 字段 | 数据来源 | 降级/说明 |
| :--- | :--- | :--- |
| `headline` / `name` | `publication.title` | 必填 |
| `author` | `publication.authors` 映射为 `{"@type": "Person", "name": author}` | 保持原作者顺序 |
| `datePublished` | `publication.date` || `String(publication.year)` | 优先精确 ISO 日期，次选年份字符串 |
| `isPartOf` | `publication.venue`（期刊映射为 `Periodical`，会议映射为 `PublicationEvent`） | 无 venue 则省略 |
| `sameAs` / `identifier` | `publication.doi`（`sameAs` 拼装为 `https://doi.org/<doi>`） | 仅在有 DOI 时输出 |
| `description` | `publication.note[lang]` || `publication.note` | 成果注记（如一作说明） |
| `abstract` | `publication.abstract[lang]` || `publication.abstract` | 论文摘要 |
| `url` | 优先取 `links.pdf`、`links.arxiv`、`links.project` 或 `links.doi` 的首个绝对 URL | 外部直达入口 |
| `keywords` | `publication.tags` 数组 | 无则省略 |

---

### 3.3 常规内容页：`BlogPosting` / `Article` / `WebPage`

当访问非首页的普通 Markdown 页面（如 `/about`、`/posts/hello`）时：
- 若 frontmatter 中指定了 `date` 或 `type: post | article`，输出 `BlogPosting` 或 `Article`。
- 其他常规单页输出标准 `WebPage`。

```json
{
  "@type": "BlogPosting",
  "@id": "https://stlin256.github.io/OpenHomepage-V2/posts/hello#article",
  "isPartOf": { "@id": "https://stlin256.github.io/OpenHomepage-V2/#website" },
  "headline": "关于 OpenHomepage-V2 的设计哲学",
  "datePublished": "2026-09-01T10:00:00Z",
  "dateModified": "2026-09-05T14:30:00Z",
  "description": "探讨轻量化与学术个人主页的设计平衡...",
  "inLanguage": "zh-CN",
  "mainEntityOfPage": "https://stlin256.github.io/OpenHomepage-V2/posts/hello",
  "author": {
    "@type": "Person",
    "name": "林知远"
  }
}
```

---

## 4. 安全性与 XSS 防护

在将生成的 JavaScript 对象序列化为 JSON 注入 HTML `<script>` 标签时，必须严格防范 XSS 注入漏洞：

1. **转义危险字符**：
   - 严禁直接 `JSON.stringify(data)` 内联至 HTML。
   - 必须通过安全序列化函数将 `<` 转义为 `\u003c`，`>` 转义为 `\u003e`，`&` 转义为 `\u0026`，`\u2028`（行分隔符）与 `\u2029`（段落分隔符）进行 Unicode 转义。
   - 杜绝 Markdown 标题或配置中的恶意文本构造 `</script><script>alert(1)</script>` 逃逸出 JSON-LD 标签。

```ts
/** 安全序列化 JSON 为适合嵌入 HTML script 标签的字符串 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
```

---

## 5. 多语言与降级策略

1. **多语言字段提取**：
   - 使用现有的 `resolveText(field, lang, defaultLang)` 工具函数解析多语言字符串映射（如 `profile.name`、`profile.tagline`、`site.description`、`pub.abstract`）。
   - `inLanguage` 属性与当前页面 HTML 的 `htmlLang` 保持一致（如 `zh-CN`、`en-US`、`ja-JP`）。
2. **缺省优雅降级**：
   - 当 `publications.yaml` 不存在或未启用时，跳过 `ScholarlyArticle` 生成，不阻断页面构建。
   - 当个人简介缺少 `avatar` 或 `links` 时，对应 Schema 属性直接省略，保持输出合法最小 Schema。
   - 当未配置任何有效站点域名时，使用相对根路径或安全回退，并在开发期给出清晰控制台提示。

---

## 6. 测试矩阵与验收门槛

### 6.1 单元测试（`tests/jsonld.test.ts`）
1. **Schema 结构测试**：
   - 首页 `ProfilePage` + `Person` + `WebSite` 的 `@graph` 树形结构验证。
   - 论文项映射为 `ScholarlyArticle` 的字段准确性测试（含多作者排序、DOI 链接转化、摘要多语言解析）。
   - 普通文章页 `BlogPosting` / `Article` 的日期格式与作者关联测试。
2. **XSS 注入防御测试**：
   - 注入包含 `</script><script>alert('xss')</script>` 及特殊 Unicode 字符的恶意文本，断言输出字符串被安全转义，无法在 DOM 中触发脚本执行。
3. **多语言解析测试**：
   - 验证切换 `lang: 'en'` 与 `lang: 'zh'` 时，生成的 Schema 文本正确对应当前语言内容。

### 6.2 质量与合规性门槛
- 符合 Google 官方 [Rich Results Test](https://search.google.com/test/rich-results) 与 Schema.org 官方验证标准。
- 覆盖率测试严格满足门槛（Lines/Stmts/Funcs ≥90%、Branches ≥80%）。

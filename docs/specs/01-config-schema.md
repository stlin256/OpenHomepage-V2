# 配置 Schema 草案（细化项 #1）

> 状态：✅ 已实现。本文件随 schema 变更同步更新。

## 1. data/site.yaml

```yaml
# ---- 站点基本信息 ----
site:
  title: "张三的主页"            # 浏览器标题 / 导航栏站点名
  description: ""               # SEO meta description
  language: zh-CN
  favicon: "assets/favicon.svg" # 站点图标（svg/png/ico，相对 data/）；缺省/文件缺失用内置默认（public/favicon.svg → /favicon.svg）

# ---- 页脚（默认开启；整段缺省也视为开启）----
footer:
  enabled: true                 # 显式 false 才关闭
  text:                         # 支持内联 markdown 链接 [文字](url)，仅 http(s)/mailto 协议（其余原样输出文本）；缺省用默认内容
    zh: "由 [OpenHomepage-V2](https://github.com/stlin256/OpenHomepage-V2) 驱动"
    en: "Powered by [OpenHomepage-V2](https://github.com/stlin256/OpenHomepage-V2)"

# ---- 个人资料（主页头部区块）----
profile:
  name: "张三"
  tagline: "博士研究生 / 方向：XXX"   # 名字下方一行
  avatar: "assets/avatar.png"   # 相对 data/ 的路径
  # avatar_position: "side"     # side=头像在简介右侧（默认杂志分栏，≤150px）；top=头像在姓名上方居顶居中（≤92px）
  bio_page: "index"             # 简介正文来自哪个页面文件（默认 index.md）
  links:                        # 社交/联系链接，渲染为图标行
    - { label: "Email",  url: "mailto:a@b.com" }
    - { label: "GitHub", url: "https://github.com/xxx" }
    - { label: "Google Scholar", url: "..." }

# ---- 主题 ----
theme:
  accent: "#3a7bd5"             # 主题色（编辑器取色器写回这里）
  default_mode: "system"        # system | light | dark
  background: "#f8f7f2"         # 浅色页面底色；#rgb/#rrggbb，缺省米黄
  background_dark: "#141311"    # 暗色页面底色；#rgb/#rrggbb，缺省暖黑

# ---- 背景音乐（整段缺省 = 不启用；宽松校验，非法字段不报错只回退）----
bgm:
  file: "assets/bgm.wav"        # 音频文件，相对 data/ 的路径（wav/mp3/ogg/m4a/flac 等）
  volume: 0.4                   # 音量 0–1，缺省/非法回退 0.4，越界 clamp
  enabled: true                 # false 强制关闭；配置了 file 且未显式 false 即启用

# ---- GitHub 区块 ----
github:
  username: "your-username"
  show_contributions: true      # 是否显示贡献热力图
  pinned:                       # pin 项目列表，顺序即展示顺序
    - repo: "owner/repo-a"
      note: "一句话说明（可选，覆盖官方描述）"
    - repo: "owner/repo-b"

# ---- RSS 区块 ----
rss:
  enabled: true
  block_title: "最近在读"        # 区块标题
  sources_file: "rss.yaml"      # 默认 rss.yaml，一般不改

# ---- 主页布局：区块顺序完全可配置 ----
home:
  layout:                       # 自上而下渲染，顺序即页面顺序
    - block: profile            # 头像 + 简介头部
    - block: streaming          # LLM 流式区块，id 引用下方定义
      id: "welcome"
    - block: editorial          # 编辑风展示区块，id 引用下方 editorial_blocks
      id: "work"
    - block: markdown           # index.md 正文
    - block: github             # 贡献图 + pin 项目
    - block: rss                # RSS 卡片流

# ---- 右下角联系卡 ----
contact:
  intro_card:
    enabled: true               # 显式 false 关闭；缺 image 时也不渲染
    delay: 4500                 # 出现延迟 ms；运行时 clamp 到 1000–20000，缺省 6000
    label: { zh: "Hello", en: "Hello" }
    title: { zh: "交个朋友", en: "Say Hello" }       # 必填
    description: { zh: "扫码交流", en: "Scan to say hello" }
    image: "assets/contact-qr.svg"                   # 必填；相对 data/

# ---- 编辑风展示区块：通过 home.layout 的 editorial + id 挂载 ----
editorial_blocks:
  - id: "work"                  # 必填且建议唯一
    tag: { zh: "01 · Work", en: "01 · Work" }
    title: { zh: "RESEARCH INDEX", en: "RESEARCH INDEX" } # 必填
    description: { zh: "...", en: "..." }
    color: "#7b9aac"            # 区块强调色；缺省继承 accent
    actions:                    # 按钮组，可选
      - label: { zh: "查看研究", en: "View research" }
        url: "/research"
        variant: primary        # primary | outline | ghost
    list:                       # 横向列表卡片，可选
      - title: { zh: "...", en: "..." }
        meta: { zh: "...", en: "..." }
        description: { zh: "...", en: "..." }
        image: "assets/cover.jpg"
        url: "/research"
    tiles:                      # 磁贴，可选
      - title: { zh: "...", en: "..." }
        kicker: { zh: "...", en: "..." }
        image: "assets/tile.jpg"
        url: "/gallery"
        size: wide              # small | wide | tall
    archive:                    # 归档效果卡片，可选
      - title: { zh: "...", en: "..." }
        status: { zh: "已归档", en: "Archived" }
        description: { zh: "...", en: "..." }
        image: "assets/archive.jpg"
    divider: true               # 区块末尾插入分割线

# ---- LLM 流式区块定义（可多个，被 home.layout 或其他页面引用）----
streaming_blocks:
  - id: "welcome"
    title: "一段话"
    content_file: "streaming/welcome.md"   # 预写 markdown
    autoplay: true              # 进入可视区自动播放
    speed: 40                   # 每 token 毫秒数

# ---- 自部署静态服务（npm run serve，整段缺省 = HTTP:8080）----
serve:
  port: 8443                    # 端口；HTTPS 缺省 8443，HTTP 缺省 8080
  ssl:                          # 整段缺省时按约定探测 项目根/certs/cert.pem + key.pem
    cert: "certs/cert.pem"      # PEM 证书路径（相对项目根）
    key: "certs/key.pem"        # PEM 私钥路径
```

`serve` 段行为（实现：`scripts/serve-lib.ts` 纯函数 + 单测）：
- 证书缺失、PEM 解析失败、证书与私钥不匹配 → 打印中文警告并**降级 HTTP**；
- 证书过期/尚未生效 → 仅警告，仍启用 HTTPS；
- `certs/` 只有单个文件（不成对）→ 警告并降级 HTTP。

任意页面的 markdown 里也可用 `::stream{id="welcome"}` / `::editorial{id="work"}` 指令嵌入流式或编辑风区块（依赖 markdown 指令能力，见细化项 #3）。

### 1.1 背景音乐（bgm）行为

- 启用且文件真实存在时：页顶静态区出现播放/暂停小图标按钮（与语言/主题按钮同排同风格），页面底部渲染 `<audio loop transition:persist>`——ClientRouter 站内转场播放不中断。
- 自动播放策略：localStorage 记住用户上次播放/暂停；上次为播放态时，等首次用户交互（click/keydown）后才恢复播放；用户点过播放按钮（本身是手势）立即开播。
- `prefers-reduced-motion: reduce`：整功能不启用（按钮隐藏、不自动播放）。
- 归一化逻辑在 `src/lib/config.ts` 的 `resolveBgm`（纯函数，有单测）。

### 1.2 页脚（footer）行为

- **默认开启**：`footer` 段整段缺省、`enabled` 未写都视为开启；只有显式 `enabled: false` 才不渲染。
- `text` 缺省用默认内容（zh/en 双语文本，OpenHomepage-V2 链到项目仓库）；支持内联 markdown 链接 `[文字](url)`，轻量解析 + sanitize（仅 http/https/mailto 协议，危险协议与不完整语法原样输出转义文本），实现见 `src/lib/footer.ts`（纯函数，有单测）。
- 渲染在 `BaseLayout` 底部（页面底部小字 muted、细分割线，样式类 `.site-footer`）。

### 1.3 主题底色与联系卡

- `theme.background` / `theme.background_dark` 写盘前由 admin 校验 hex；构建侧非法值不覆盖内置默认色板。
- `resolveIntroCard()` 归一化右下联系卡：关闭、缺标题或缺图片时不渲染；延迟限制到 1–20 秒。
- `editorial_blocks` 的权威定义是结构化数据；后台在“编辑区块”页编辑它，在“流式块”页把它挂进主页布局。正文也能用 `::editorial{id}` 引用同一份定义，不复制内容。

## 2. data/rss.yaml

```yaml
display: grouped                # grouped（按源分栏）| mixed（按权重混排），可切换
sources:
  - name: "某博客"
    url: "https://example.com/feed.xml"
    mode: latest
    latest: 5                   # 取最新 5 篇
    weight: 2                   # mixed 模式下排序权重，越大越靠前

  - name: "精选收藏"
    url: "https://another.com/rss"
    mode: curated               # 指定文章模式
    weight: 3
    articles:
      - url: "https://another.com/post/1"
        note: "推荐理由一句话"   # 可选，显示在卡片上
      - url: "https://another.com/post/2"
```

卡片字段：标题、来源名、发布时间、摘要（构建时截取）、原文链接、可选 note。

排序规则：
- `grouped`：每个源一个栏目，栏目顺序 = sources 列表顺序，栏目内按发布时间倒序；
- `mixed`：统一卡片流，排序键 = 发布时间 × 源权重（weight 越大条目越靠前，同权重按时间倒序）；无日期的排最后。

## 3. 页面 frontmatter（data/pages/*.md）

```yaml
---
title: "研究方向"        # 页面标题 & 导航 tab 文案
nav: true              # false 则可通过链接访问但不进导航
order: 2               # 导航排序，小的在前；主页固定 order: 0
slug: "research"       # 路由 /research；缺省用文件名
description: ""        # 可选，SEO
---
正文 markdown……
```

主页约定为 `index.md`（slug 特殊处理为 `/`）。

# 配置 Schema 草案（细化项 #1）

> 状态：待讨论确认。确认后回填 design.md 第 4 节。

## 1. data/site.yaml

```yaml
# ---- 站点基本信息 ----
site:
  title: "张三的主页"            # 浏览器标题 / 导航栏站点名
  description: ""               # SEO meta description
  language: zh-CN
  favicon: "assets/favicon.svg" # 站点图标（svg/png/ico，相对 data/）；缺省/文件缺失用内置默认（public/favicon.svg → /favicon.svg）
  # footer: 暂无字段定义——design.md §4 提到页脚，但 schema 未定；M4a 未实现页脚，待补充字段后实现

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
    - block: markdown           # index.md 正文
    - block: streaming          # 流式区块，id 引用下方定义
      id: "welcome"
    - block: github             # 贡献图 + pin 项目
    - block: rss                # RSS 卡片流

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

任意页面的 markdown 里也可用 `::stream{id="welcome"}` 指令嵌入流式区块（依赖 markdown 指令能力，见细化项 #3）。

### 1.1 背景音乐（bgm）行为

- 启用且文件真实存在时：页顶静态区出现播放/暂停小图标按钮（与语言/主题按钮同排同风格），页面底部渲染 `<audio loop transition:persist>`——ClientRouter 站内转场播放不中断。
- 自动播放策略：localStorage 记住用户上次播放/暂停；上次为播放态时，等首次用户交互（click/keydown）后才恢复播放；用户点过播放按钮（本身是手势）立即开播。
- `prefers-reduced-motion: reduce`：整功能不启用（按钮隐藏、不自动播放）。
- 归一化逻辑在 `src/lib/config.ts` 的 `resolveBgm`（纯函数，有单测）。

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

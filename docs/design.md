# OpenHomepage V2 设计文档

> 本文档是项目的权威设计依据，随讨论逐项细化更新。最后更新：2026-08-25（编辑区块、联系卡与 M10 编辑器交互）

## 1. 项目定位

个人主页网站：轻量化、简洁、具备表现力动效；杂志化排版 × 科研人员主页式的简洁。多页面静态站点，部署到 GitHub Pages。

## 2. 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 站点框架 | Astro (SSG) | 多页静态生成，markdown 一等公民，交互组件按需注水 |
| 数据预取 | Node 脚本 `scripts/prefetch.mjs` | 构建前抓取 GitHub / RSS，逻辑复用旧项目模式（见 reusable-components.md，该文件不入库） |
| markdown 渲染 | Astro 内容管线 + Shiki 代码高亮 + 自定义指令插件 | GFM、超链接、代码高亮、内嵌播放器、HTML 混写 |
| 编辑器 | `npm run admin` 本地 Web 服务 + Milkdown (WYSIWYG) | 仅 PC 端，读写本地 `data/` |
| 部署 | GitHub Actions → GitHub Pages (gh-pages 分支) | 见第 8 节 |

## 3. 目录结构（规划）

```
├── data/                  # 【不入库】一切页面配置与内容（npm run setup 从 data.example 生成）
│   ├── site.yaml          # 站点配置：GitHub 用户名、主题色、导航等
│   ├── pages/<lang>/*.md  # 按语言子目录（zh/ en/）；每个 *.md 自动成为一个路由 + 导航 tab
│   ├── streaming/<lang>/  # 流式区块预写内容，按语言分目录
│   ├── rss.yaml           # RSS 源配置
│   └── assets/            # 头像等素材
├── data.example/          # 【入库】示例数据，兼作单元测试 fixture
├── docs/                  # 设计文档（本文档）
├── scripts/
│   ├── prefetch.ts        # GitHub / RSS 数据预取，带缓存降级（tsx 运行，npm run prefetch）
│   └── setup.mjs          # npm run setup：从 data.example 初始化本地 data/
├── src/                   # Astro 站点源码
│   ├── lib/               # 纯函数层（config / markdown / prefetch / theme / routes / home / data-dir，可单测）
│   ├── layouts/           # BaseLayout.astro 站点外壳（导航 / 主题 / 语言切换）
│   ├── styles/            # global.css：语义色变量、杂志网格、排版
│   └── pages/             # [...slug].astro 全站动态路由（M4 起）
├── tests/                 # vitest 单元测试
├── admin/                 # 可视化编辑器
├── .cache/                # 【不入库】预取数据缓存
└── .github/workflows/     # 部署工作流
```

## 4. data 文件夹规范

- 整个 `data/` 加入 `.gitignore`，不提交。
- `data/pages/*.md`：frontmatter 字段含 `title`、`nav`（是否进导航）、`order`（排序）等，正文 markdown。
- `data/site.yaml`：站点标题、GitHub 用户名、主题色、页脚、pin 仓库列表、流式区块配置等。
- `data/rss.yaml`：RSS 源列表；每个源支持两种模式：
  - `latest: N` —— 订阅该源最新 N 篇文章；
  - `articles:` —— 指定具体文章 URL 列表，并按配置格式编排。

## 5. 页面与功能模块

### 5.1 主页区块
- 头像 + 个人简介：图文并茂，markdown 渲染。
- 编辑风展示区块：结构化列表、磁贴、归档卡、按钮组和分割线，由 `editorial_blocks` 定义并按 id 挂载。
- GitHub 贡献热力图：自绘组件，构建时经 GraphQL 拉取（需 PAT）。
- Pin 项目卡片：`site.yaml` 配置 `owner/repo` 列表，构建时拉取 star 数、描述、语言渲染。
- RSS 卡片流：多源混排；hover 浮层展示标题 + 摘要 + 发布时间；点击跳转原文。
- LLM 流式区块：预写 markdown 内容，前端模拟流式（打字机式）渲染；**位置可配置**（哪个页面哪个位置，可多处）；滚动进入可视区触发，可重播。

### 5.2 markdown 渲染能力
- 标准 GFM + 代码高亮（Shiki）+ 超链接。
- 内嵌播放器：自定义指令语法（如 `::bilibili{aid=...}`、`:::video{src=...}`）**且**允许 HTML 混写（`<iframe>` 等）。

### 5.3 导航与主题
- 桌面端：左上竖排 tab；移动端：折叠为汉堡（三横线）按钮。
- 明暗双主题，默认跟随系统。
- 主题色：`site.yaml` 指定；编辑器提供取色器——自动从头像提取若干候选色，也支持在头像上手动点取。
- 页面底色：浅色默认米黄，暗色默认暖黑；两者可通过 `theme.background` / `theme.background_dark` 覆盖。
- 动效：表现力型（视差滚动、磁吸按钮、页面转场、滚动显现、流式打字），注意性能预算。

## 6. 可视化编辑器（仅 PC）

- `npm run admin` 启动本地 Web 服务，浏览器打开，直接读写 `data/` 文件。
- markdown 页面：所见即所得编辑（Milkdown 内核），存盘转回 markdown。
- data 配置：表单化界面（站点信息、编辑区块与右下联系卡、RSS 源、pin 项目、流式区块、主页布局、主题底色等）。
- 反馈优先：不做装饰性动效；用当前导航态、保存状态、焦点样式和键盘可达控件表达界面变化。
- 主题色取色器：头像候选色 + 手动点取。

## 7. 数据获取与缓存（prefetch）

- `scripts/prefetch.mjs` 在构建前运行，输出 JSON 到 `.cache/`（供构建读取，失败降级用旧缓存）。
- GitHub：用户信息 / pin 仓库（REST，可匿名但限流）；贡献图（GraphQL，需 PAT）。
- RSS：feedparser 等效解析（Node 侧选型待定）；摘要在构建时抓取固化，hover 预览纯静态实现。
- 缓存策略：正常有效期 1 小时，失败重试缓存 15 分钟，请求失败返回过期缓存兜底。

## 8. CI/CD 与降级策略

### Secrets / Variables
| 名称 | 类型 | 用途 |
|------|------|------|
| `DATA_SOURCE_URL` | Secret | data zip 包直链 |
| `GH_PAT` | Secret | GitHub PAT（read:user），用于贡献图 GraphQL |

### 构建流程
1. 下载 `DATA_SOURCE_URL` 的 zip 并解压为 `data/`
2. `node scripts/prefetch.mjs`（注入 `GH_PAT`）
3. `astro build` → `dist/`
4. 构建成功：把当次 `data/` 打快照（`data-snapshot.zip`）一并存入产物
5. 部署到 gh-pages 分支

### 降级与邮件提醒
- 在线源失效 → 从上次 gh-pages 产物中的 `data-snapshot.zip` 恢复 data，只重跑 prefetch 更新 GitHub/RSS 动态区块，再全量重建部署。
- 凡使用了快照回退：部署完成后让 workflow 以**失败状态**结束（summary 写明"部署成功但数据源失效，使用了快照"），以此触发 GitHub 自带失败邮件通知。
- 注意：Actions 页面会显示红色失败，但线上已更新，属预期行为。

## 9. Git 管理规范

- 全程 git 管理；以下不入库：
  - `data/`（含个人信息与排版）
  - `reusable-components.md`（用户提供的外部资料）
  - `.cache/`、`node_modules/`、`dist/` 等运行时/构建产物
- 提交前需用户确认。

## 10. 逐项细化清单（进行中）

以下各项将逐项与用户讨论细化，结论回填本文档对应章节：

1. [x] `site.yaml` / `rss.yaml` / frontmatter 的完整字段定义 → [docs/specs/01-config-schema.md](specs/01-config-schema.md)（主页布局为可配置区块列表；支持主题底色、编辑区块和右下联系卡；RSS 支持 grouped/mixed 两种模式切换）
2. [x] 主页布局线框（区块顺序、杂志化网格） → [docs/specs/02-home-layout.md](specs/02-home-layout.md)（B 杂志网格；系统字体栈 + JetBrains Mono）
3. [x] markdown 自定义指令语法清单 → [docs/specs/03-markdown-directives.md](specs/03-markdown-directives.md)（播放器/figure/grid/stream/ghcard 全套；播放器点击加载；支持 KaTeX）
4. [x] 流式区块配置字段与播放行为细节 → [docs/specs/04-streaming-block.md](specs/04-streaming-block.md)（增量渲染 markdown；拟真抖动；进入可视区自动播 + 重播按钮）
5. [x] RSS 卡片字段与"指定文章编排格式"的具体形态 → [docs/specs/05-rss-cards.md](specs/05-rss-cards.md)（hover 浮层；封面由用户声明，curated 可逐篇声明）
6. [x] 编辑器信息架构（页面/功能划分） → [docs/specs/06-editor.md](specs/06-editor.md)（侧栏模块化；新建向导；粘贴图片入库；自动保存+版本快照；M10 导航反馈与长表单整理）
7. [x] prefetch 缓存文件结构与失败降级细节 → [docs/specs/07-prefetch.md](specs/07-prefetch.md)（3 个 JSON；TTL 1h/失败 15min；无缓存即构建报错，本地无 PAT 贡献图除外）
8. [x] workflow 文件细节（触发条件、快照恢复、失败标记实现） → [docs/specs/08-workflow.md](specs/08-workflow.md)（每 8h 半点；快照含版本历史；回退后标红触发邮件）
9. [x] 动效清单与性能预算 → [docs/specs/09-animations.md](specs/09-animations.md)（九项动效按清单；性能预算为软目标）
10. [x] 主题色变量体系（明暗双主题下的语义色） → [docs/specs/10-theme-colors.md](specs/10-theme-colors.md)（中性色固定 + accent 可配；深色自动校正）
11. [x] i18n（页面多语言 / 编辑器 / CI 文案） → [docs/specs/11-i18n.md](specs/11-i18n.md)（子目录分语言；缺译回退 en；配置文案双语映射；编辑器中英可切；workflow 注解双语）

另：已建立 `skills/editing-data/SKILL.md`，指导 AI 正确编辑 data/ 文件夹。

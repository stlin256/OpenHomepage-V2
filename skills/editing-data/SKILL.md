---
name: editing-data
description: 指导 AI 如何正确编辑 OpenHomepage V2 的 data/ 内容与配置（页面、编辑区块、联系卡、主题底色、RSS、流式区块、素材），用于"帮我改主页/加页面/改配置"类任务。
---

# 编辑 data/ 文件夹的规范

`data/` 是 OpenHomepage V2 的全部内容与配置来源，**不入 git**。权威 Schema 定义见 `docs/specs/01-config-schema.md`，编辑任何文件前先读它和相关细则文档（`docs/specs/`）。

## 目录结构

```
data/
├── site.yaml          # 站点配置（site[含 favicon] / profile / theme / footer / contact / github / rss / home.layout / editorial_blocks / streaming_blocks）
├── rss.yaml           # RSS 源（display: grouped|mixed；sources 列表）
├── pages/             # 页面，按语言分目录，每个 *.md 自动成路由
│   ├── zh/            # 中文页面（index.md = 主页，slug 为 /）
│   ├── en/            # 英文页面（存在两个及以上语言目录即自动启用 i18n）
│   ├── ja/            # 日语页面（演示数据随附；语言目录任意，不限于演示的四种）
│   └── fr/            # 法语页面（演示数据随附）
├── streaming/         # 流式区块的预写 markdown，同样按语言分目录
└── assets/            # 图片等素材
```

## 多语言

- **支持任意语言**：语言即 `pages/<语言码>/` 目录名，用主语言子标签（zh/en/ja/fr/de/ko/…，2–3 小写字母）。新增语言 = 新建目录 + 至少一个页面（建议先建 `index.md`）；路由、导航、hreflang、语言切换器自动生效，无需改代码。
- **默认语言**：`site.yaml` 的 `site.language`（如 `zh-CN`，取主标签 `zh`）。默认语言的 URL 不带语言前缀（`/`、`/research`），其他语言带前缀（`/en/`、`/de/research`）。演示数据的默认语言是中文。
- **回退链**：缺译内容按「当前语言 → en → 默认语言 → 任一可用版本」静默回退渲染；配置文案映射缺 key 回退 en → 默认语言。
- **语言切换器**：只显示当前页面真实存在译文的语言（回退渲染的语言不出现在菜单里），单语言站点不显示切换器。
- **编辑器创建**：后台「新建页面」向导的语言下拉 = 已有语言 + 常用语言（选中即新建语言目录）；页面编辑器的「创建另一语言版」弹窗同样列出可选目标语言（已拥有该页的语言不列出）。


## 编辑规则

1. **页面**：改内容直接编辑 `data/pages/<语言>/<slug>.md`。新建页面必须写 frontmatter（`title`/`nav`/`order`，`slug` 可省略=文件名）。多语言：把文件复制到另一语言目录（如 `pages/zh/research.md` → `pages/en/research.md`）并翻译，frontmatter 的 `title` 也要翻译；缺译页面按「当前语言 → en → 默认语言」静默回退渲染，不显示降级提示条。新增整门语言见上文「多语言」一节。
2. **markdown 扩展**：可用指令 `::bilibili{}` `::youtube{}` `:::video{}` `:::audio{src="..." [title="..."] [description="..."] [cover="..."]}`（支持紧凑模式与带封面的卡片模式） `:::figure{}` `:::grid{}` `::stream{}` `::ghcard{}` `::editorial{id="..."}`，语法见 `docs/specs/03-markdown-directives.md`；支持 HTML 混写和 KaTeX（`$...$` / `$$...$$`）。`::editorial` 必须引用 `site.yaml` 中已定义的 `editorial_blocks` id；特性页 `features` 已展示完整组件套件。
3. **配置文案多语言**：site.yaml / rss.yaml 中面向用户的文案字段可写多语言映射（如 `{zh: ..., en: ...}`，键为语言码、数量不限，按站点实际语言补齐）；存在多语言页面时应主动把区块标题等补齐各语言文案（缺 key 回退 en → 默认语言）。
4. **主页布局与编辑区块**：顺序改 `site.yaml` 的 `home.layout`。流式区块以 `- block: streaming` + `id:` 引用；编辑风列表/磁贴/归档卡以 `- block: editorial` + `id:` 引用 `editorial_blocks` 中同 id 的定义。文案优先提供 `{zh,en}` 双语值。
5. **右下联系卡**：配置在 `contact.intro_card`；`image` 必须指向 `data/assets/` 内可访问图片，通常是二维码。`delay` 会被限制到 1000–20000 ms。
6. **主题底色**：`theme.background` 是浅色底色，缺省米黄；`theme.background_dark` 是暗色底色，缺省暖黑。两者必须是 `#rgb` 或 `#rrggbb`。GitHub 贡献图和仓库卡的既有观感保持不变。
7. **RSS**：加源在 `rss.yaml` 的 `sources` 追加；curated 模式逐篇配 `url` + 可选 `note`/`cover`。封面规则：显式声明的 `cover` 优先；curated 条目未声明时 prefetch 会自动抓文章页提取 `og:image`（回退 `twitter:image` → 正文首个 img），无需手动声明；外链封面加载失败时前端自动隐藏图位。
8. **素材**：图片放入 `data/assets/`，markdown 和 YAML 里用 `assets/xxx.jpg` 相对路径引用。不要引用 data/ 之外的路径。
9. **校验与预览**：改完 YAML 至少用 YAML 解析器校验语法；跑 `npm test` 守护纯函数行为，必要时 `npm run build` 看站点构建。UI/交互改动要补 jsdom 流程测试。
10. **不要做的事**：
   - 不要把 data/ 提交进 git（已在 .gitignore，不要移除该规则）；
   - 不要在配置里写入 token/密码等机密（GitHub PAT 只配在仓库 Secrets）；
   - 不要手写 `.cache/` 里的文件（由 prefetch 生成）；
   - 不要为编辑器加装饰性动效；反馈用明确的状态文本、焦点样式和原生控件表达。

## 版本快照

编辑器自动维护 `data/.snapshots/` 版本历史；AI 直接编辑文件不会生成快照——大改前建议先 `cp` 备份目标文件，或提醒用户用编辑器做这类修改。

## 编辑器能力速查

- 页面正文以「可视化编辑」为主：后台页面视图点击后在真实渲染页上直编（悬停描边、文本块就地微编辑器、指令/grid 右侧检查器、插入抽屉、页面设置面板）。
- 后台页面视图保留 frontmatter 表单与整页源码编辑（兜底）；左侧菜单可通过顶栏按钮折叠，状态由浏览器记忆。
- 后台“编辑区块”页管理 `editorial_blocks` 与 `contact.intro_card`；“流式块”页管理流式块定义和 `home.layout`。
- 自动保存停顿约 1.5 秒；界面状态依次提示未保存、保存中、已保存或失败。
- 编辑区块表单用原生折叠面板组织；主页布局支持拖拽和上移/下移按钮。


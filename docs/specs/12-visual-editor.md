# 可视化编辑器重构：渲染页直编（细化项 #12）

> 状态：📐 设计定稿（2026-08-27 与用户讨论敲定），未实现。
> 取代 06 的编辑器形态：admin 内 Milkdown 全文编辑器、所见即所得/源码/双栏三模式、内嵌 iframe 预览**全部移除**；正文编辑迁移到 astro dev 渲染页上的 overlay。
> 硬约束：markdown + 自定义指令**无损往返**；仅适配 PC；功能不丢（自动保存/快照/粘贴图片/页面管理/i18n/明暗主题）。

## 0. 决策记录（2026-08-27 讨论结论）

| 议题 | 结论 |
|------|------|
| 所见即所得形态 | 在渲染页面上直接编辑（WordPress 自定义器形态），不做"编辑器里套样式"的近似方案 |
| 编辑器内核 | Milkdown 仅保留为**块级就地微编辑器**（只处理纯文本块，不含指令节点）；全文编辑器移除 |
| 预览形态 | 独立浏览器标签页（编辑即发生在该页），admin 内不再内嵌 iframe 预览 |
| 文本块编辑 | 就地微编辑器（点击块→原位挂载迷你 Milkdown→序列化回 markdown 拼接），不用 contenteditable + HTML→md（有损） |
| 范围 | 一步到位：页面正文、grid 单元格内部、首页配置驱动区块、yaml 简单文本字段全部 v1 覆盖 |
| 块排序 | 浮动工具条的上移/下移按钮（键盘可达）；拖拽留 v2 |
| 配置表单 | overlay 右侧面板内**原生重写**（不嵌 admin iframe），视觉统一 |
| yaml 文本字段 | 支持点击就地改字（`data-oh-cfg` 坐标） |
| 面板位置 | 右侧滑出（Gutenberg 块检查器风格）；顶栏放页面级操作 |

## 1. 总体形态

```
标签页 A：管理后台 (127.0.0.1:4174)          标签页 B：可视化编辑 (dev server 页面 ?edit=1)
┌──────────────────────────────┐            ┌──────────────────────────────────┐
│ 顶栏: 站点名  保存状态  主题  语言│            │ 编辑栏(overlay注入):              │
├────────┬─────────────────────┤            │  ←后台 │ 页面下拉 │ ＋插入 │ 页面设置 │ 退出 │
│ 侧栏    │ 主区                 │            ├─────────────────────┬────────────┤
│ ▸页面  │ 页面 → 设置表单+源码   │            │ 【真实渲染的站点页面】 │ 右侧检查器   │
│ ▸配置  │       [可视化编辑]按钮 ──┼──新标签──→ │  hover 块→描边+浮动工具条│ (点击块时  │
│ ▸素材  │ 配置 → 表单(保留)     │            │   编辑/上移/下移/删除/下方插入│  滑出)     │
│        │ 素材 → 管理器(保留)   │            │                     │ 指令参数表单 │
└────────┴─────────────────────┘            └─────────────────────┴────────────┘
```

- 两个标签页各自自治：overlay 顶栏自带页面切换/插入/页面设置，不依赖 admin 页面状态。
- admin 页面视图简化为：frontmatter 设置表单 + 整页源码 textarea（兜底）+「可视化编辑」主按钮（确保 dev server 运行后打开对应页面 `?edit=1`）。

## 2. 架构

### 2.1 编辑模式的注入与激活

- admin server 拉起 astro dev 时注入环境变量 `OH_EDIT=1`（外部手动启动的 dev server 无此变量 → 页面零编辑痕迹）。
- `src/lib/markdown.ts` 的 `MarkdownOptions` 新增 `editSource?: string`（值为 data/ 相对路径，如 `pages/zh/index.md`）；`[...slug].astro` 在 `OH_EDIT` 下给正文、流式块内容等每次 `renderMarkdown` 调用传入对应文件路径。
- `BaseLayout` 在 `OH_EDIT` 下输出一个 ~20 行的内联 bootstrap：检测 `?edit=1`（或 sessionStorage 已有标记）→ 动态加载 admin server 托管的 `/overlay.js` + `/overlay.css`（origin 由 bootstrap 内联注入 `window.__OH_ADMIN_ORIGIN__`），并用 `history.replaceState` 摘掉 query。非编辑访问零开销。
- 编辑模式跨页面导航/刷新由 sessionStorage 标记维持；「退出编辑」清标记并刷新。

### 2.2 源码坐标 `data-oh-src`（markdown 块 ↔ DOM 映射）

- 新增共享纯函数 `listEditableBlocks(body): { start, end, kind, name? }[]`（放 `src/lib/`，remark-parse + GFM + remark-directive + remark-math 解析，只依赖 mdast position）：枚举**顶层块**以及 **grid/cell 容器内部的块**（递归，支持嵌套 grid）。
- remark 插件 `remarkEditSpans`（仅 `editSource` 存在时启用，在自定义指令映射之后运行）：给每个可编辑块的 hast 输出加 `data-oh-src="<fileRef>:<start>,<end>"`。指令节点合并进其既有 `hProperties`；文本块经 `data.hProperties` 下发。`data*` 本就在 sanitize 白名单。
- stream/ghcard/editorial 三个占位替换插件在编辑模式下由"替换"改为"包裹"：`<div data-oh-src=... class="oh-embed">原始片段</div>`（仅编辑模式，生产渲染不变）。
- overlay 扫描 `[data-oh-src]` 建立块注册表；hover 高亮/工具条锚定都基于它。文件内容以服务端为准，overlay 不在本地拼 markdown。

### 2.3 配置字段坐标 `data-oh-cfg`（yaml 字段 ↔ DOM 映射）

- `.astro` 组件在 `OH_EDIT` 下给简单文本字段的输出元素加 `data-oh-cfg="<yaml路径>@<lang>"`，助手 `editAttr(path, lang)` 放 `src/lib/`。v1 覆盖：站点标题、profile 昵称/简介、页脚文本、RSS 区块标题、流式块标题。
- 点击这类元素 → 就地单行/多行输入 → `POST /api/config/field`（按路径写回 site.yaml，复用 schema 校验与快照）。
- 结构复杂的首页区块（profile/github/rss/streaming/editorial）：点击 → 右侧检查器显示**原生重写的对应配置表单**（读写现有 `GET/PUT /api/config/site|rss`，按段合并）。

### 2.4 overlay 组成（`admin/ui/overlay/`，无框架 TS，admin server esbuild 打包）

- `main.ts` 入口 + 顶栏（页面下拉切换、＋插入抽屉、页面设置、保存状态、退出）。
- `scanner.ts`：块注册表（`data-oh-src` / `data-oh-cfg`）。
- `toolbar.ts`：hover 描边 + 浮动工具条（编辑/上移/下移/删除/下方插入；grid 块另有"列设置"）。
- `textedit.ts`：文本块就地微编辑器——原位挂载迷你 Milkdown（仅 commonmark+GFM，无指令节点；页面样式直接作用于编辑面），完成/取消；保存走既有序列化管线保证无损。
- `inspector.ts`：右侧检查器——指令参数表单（由 `DIRECTIVE_DEFS` 元数据生成，元数据从 `admin/ui/editor/directive-nodes.ts` 抽到 `admin/shared/directives.ts`）、grid 列数与单元格增删、配置区块表单、页面设置表单。
- 粘贴图片：微编辑器内沿用现有 `POST /api/asset` 上传 + 插入 `assets/<name>` 引用。
- CORS：overlay 跑在 dev server origin，调 admin API 需跨域；admin server 对 `/api/*` 放行回环 origin（127.0.0.1/[::1]/localhost 正则）+ OPTIONS 预检。纯本地工具，风险可控。

### 2.5 块级 API（admin/server 新增）

| API | 说明 |
|-----|------|
| `POST /api/page/block` | `{ path, op: replace\|insert\|delete\|move, start, end, hash, markdown?, to? }`；服务端用同一个 `listEditableBlocks` 重新解析，校验坐标处内容与 `hash` 一致（防陈旧写），按偏移拼接，schema/round-trip 校验 + 快照后落盘 |
| `POST /api/config/field` | `{ file: site\|rss, path, lang?, value }` 单字段写回，校验+快照 |

所有写操作沿用现有设施：`safeResolve` 路径限制、写前校验、`.snapshots` 快照（每次落盘自动留版，回滚仍在 admin）。

### 2.6 保存与刷新流程

块编辑/排序/增删、字段直改、面板表单保存 → API 成功返回 → `location.reload()`（dev server 按请求重新渲染即最新效果；sessionStorage 保持编辑模式）→ overlay 重新扫描坐标。保存中/失败状态显示在 overlay 顶栏（polite live region，沿用 M10 反馈原则）。

## 3. 交互细则：各类目标点击后

| 目标 | 交互 |
|------|------|
| 段落/标题/列表/引用/代码块 | 点击（或工具条"编辑"）→ 原位微编辑器；Esc 取消，Ctrl+Enter/完成按钮保存 |
| 叶指令（bilibili/youtube/figure/ghcard/editorial/stream…） | 点击 → 右侧检查器参数表单 → 保存回写指令语法 |
| grid 容器 | 点击 → 检查器：列数、增删单元格；内部块照常直编 |
| cell 内块 | 与顶层块完全同等（坐标递归）；移动/插入限定在**同一父容器**内（防跨容器结构破坏） |
| 首页配置区块（profile/github/rss/streaming/editorial） | 点击 → 右侧检查器原生配置表单（编辑 site.yaml/rss.yaml 对应段） |
| `data-oh-cfg` 文本 | 点击 → 就地改字 → 回车保存 |
| 页面设置 | 顶栏按钮 → 检查器显示 frontmatter 表单（标题/slug/nav/order/描述/notice） |
| 页面切换 | 顶栏页面下拉 → 跳转对应页面路径（编辑模式保持） |

## 4. admin 改造

- **移除**：`admin/ui/editor/`（Milkdown 全文装配、指令节点视图）、views/pages.ts 的三模式/工具栏/双栏预览、`GET /api/directive-preview`（真实渲染即预览，不再需要预览卡数据接口）。`admin/ui/editor/directive-nodes.ts` 中的指令元数据抽到 `admin/shared/directives.ts` 后删除 Milkdown 部分。
- **保留不动**：配置视图、素材管理、快照、站点信息、预览服务管理、i18n、明暗主题、侧栏折叠。
- **页面视图重写**：frontmatter 设置表单 + 整页源码 textarea（等宽，自动保存）+「可视化编辑」主按钮 + 页面操作（快照/重命名/删除/创建另一语言版）。

## 5. 范围边界（v1 明确不做）

- 块拖拽排序（v2，沿用按钮先保证键盘可达）。
- 跨容器移动块、grid 单元格的可视化拖拽分栏。
- overlay 内撤销/重做（用快照回滚兜底）。
- 流式块内容的页面内直编（其打字机动画与静态编辑冲突；内容经检查器表单中的 markdown 字段编辑）。
- 移动端适配。

## 6. 测试策略

- `listEditableBlocks` 单测：各类块/嵌套 grid/异常围栏的坐标枚举与拼接往返。
- 块级 API 测试：replace/insert/delete/move 正常路径 + hash 陈旧冲突 + 路径越权 + 校验失败不落盘。
- `remarkEditSpans` 测试：坐标属性注入、占位包裹模式、生产模式零注入。
- overlay jsdom 测试：scanner 注册表、工具条锚定、检查器开关；沿用现有 vitest 设施，不引入浏览器 E2E。

## 7. 里程碑拆分

1. **M12a 地基**：`listEditableBlocks` + span 注入 + 占位包裹 + bootstrap/overlay 骨架（hover 描边 + 块注册表）+ 块级 API。
2. **M12b 正文直编**：微编辑器 + 浮动工具条（编辑/上移/下移/删除/下方插入）+ 插入抽屉。
3. **M12c 指令与 grid**：右侧检查器 + 指令参数表单 + grid 列设置/单元格增删。
4. **M12d 配置与字段**：`data-oh-cfg` 就地改字 + 首页配置区块原生表单 + 页面设置面板 + 页面切换。
5. **M12e admin 收尾**：页面视图重写、旧编辑器与双栏预览移除、文档（06 标记被取代）与测试清理。

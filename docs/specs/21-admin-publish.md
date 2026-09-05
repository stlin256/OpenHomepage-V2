# 21：Admin 发布闭环（一键构建 + dist 预览 + 学术成果逐条编辑 + OG 分享卡预览）

> 状态：已实现。范围：后台侧栏「发布」视图（构建/预览/OG 卡）与「学术成果」视图的逐条图形编辑。
> 全局约束：零新增 npm 依赖；构建/预览进程管理复用 devserver.ts 的模式（node 直跑 CLI 避开 .cmd 壳、幂等、接管探测、Windows taskkill 树杀）；任何覆盖性写入前必须留快照；仅监听 127.0.0.1。

## 1. 用户目标

- **一键构建**：后台点一个按钮跑完整构建链（fonts → OG → astro build → critical-css → images），看得到阶段进度与日志，不用开终端；
- **dist 预览**：构建成功后一键起本地静态服务预览产物，验证「构建出来的是什么」；
- **学术成果逐条编辑**：改一条论文记录不再手写 YAML，列表 + 表单增删改，保存走快照链路；
- **OG 分享卡预览**：不改配置、不跑构建，即时看某个页面的分享卡效果。

## 2. 一键构建（`admin/server/build.ts` + 发布视图）

### 2.1 构建链

`buildStages(rootDir, execPath)` 纯函数产出 5 个阶段（与 `package.json scripts.build` 一致）：

| 阶段 id | 命令 |
|---------|------|
| `fonts` | `node node_modules/tsx/dist/cli.mjs scripts/generate-fonts.ts` |
| `og` | `node node_modules/tsx/dist/cli.mjs scripts/generate-og-images.ts` |
| `astro` | `node node_modules/astro/bin/astro.mjs build` |
| `css` | `node node_modules/tsx/dist/cli.mjs scripts/optimize-critical-css.ts` |
| `images` | `node node_modules/tsx/dist/cli.mjs scripts/optimize-images.ts` |

与 devserver 一样用当前 node 直跑 CLI，避开 Windows 下 npm/.cmd 壳（可精确控制进程树）。

### 2.2 状态机与进程管理

- 状态：`idle → running → success | failed`；每阶段一个子进程，退出码 0 推进下一阶段，非零即 `failed`（`error` 含阶段 id）；
- 同一时间只允许一个构建：进行中再调 `start()` 抛 `BuildConflictError`（http 层映射 **409**）；
- `stop()` 取消进行中构建：杀子进程树（Windows `taskkill /T /F`，POSIX 进程组，复用 devserver 的 `killProcessTree`），状态回 `idle` 可重新构建；
- 日志：stdout/stderr 按行入环形缓冲（200 行），每阶段前有 `▶ <id>` 分隔行；
- admin 退出（SIGINT/SIGTERM）时随 shutdown 取消进行中构建；
- `spawn`/`platform`/`execPath` 全部可注入，测试用假 runner 验证状态机（不真跑 astro build）。

### 2.3 HTTP 端点

| 方法 | 路径 | 响应 |
|------|------|------|
| POST | `/api/build/start` | `BuildStatus`；进行中 409 |
| POST | `/api/build/stop` | `BuildStatus` |
| GET | `/api/build/status` | `{ status, stages, stageIndex, logTail, error, startedAt, finishedAt }` |

前端每 1.2s 轮询 `status`：阶段胶囊（当前高亮/已过置灰）、滚动日志区（自动滚底）、成功/失败态；构建由服务端持有，刷新页面后重进视图继续显示进行中的构建。

## 3. dist 静态预览（`admin/server/preview.ts`）

- **进程内**起 HTTP 服务：直接复用 `scripts/serve.ts` 的 `createStaticServer`（serve-lib 的路径解析/MIME/缓存策略，含 404.html 兜底），不 spawn 子进程——admin 退出时 `close()` 即清理，天然无残留；
- 仅监听 `127.0.0.1`，默认端口 **4399**（避开 admin 4174 / astro dev 4321 / 自部署 serve 8080）；预览固定 HTTP（本地用途，不走 SSL 决策）；
- 幂等 `start()`：已启动直接返回状态；端口被外部服务占用时探测接管上报（`up=true, managed=false`，`stop()` 不动外部服务，同 devserver 语义）；
- `dist/` 不存在时不启动，`error` 提示先构建；
- 端点：`POST /api/preview/start` | `POST /api/preview/stop` | `GET /api/preview/status`（`{ up, managed, url, port, error }`）；
- 前端：状态行 + 启停按钮 + 「在新标签打开」链接（3s 轮询）。

## 4. 学术成果逐条编辑（`admin/server/publications.ts` + 学术成果视图上半区）

- 视图结构：「条目管理」（列表 + 新增/编辑/删除表单弹窗）在上，原 BibTeX 批量导入面板（spec 18）在下，两者共存；导入成功后列表自动刷新；
- 表单字段与 `data.example/publications.yaml` 实际结构对齐：`id`（留空按标题派生，冲突自动 `-2`）、`title`/`authors`（逗号分隔）/`year`/`venue` 必填，`date`/`type`（六选下拉）/`venue_short`/`tags`/`badges`/`note`（中英）/`abstract`（中英）/`links`（pdf/code/project/slides/dataset）/`bibtex_key`/`teaser`/`order` 可选；可选字段留空即删键，保持 YAML 干净；
- **未知字段往返不丢**：表单在克隆的原条目上只覆盖已知键，`doi` 等 schema 外字段原样保留；
- 保存链路：`GET /api/config/publications` 读整份 → 前端改列表 → `PUT /api/config/publications` 整文件写回；服务端 `validatePublications` 逐条校验（必填约束与 `src/lib/publications.ts` 的 `normalizeItem` 对齐 + `id` 唯一 + `type` 枚举），失败 400 不落盘；通过后 `createSnapshot` → `dumpYaml` → `notifyWrite`（撤销链），与 configs 保存链路一致；文件不存在时直接新建（无快照）。

## 5. OG 分享卡预览（`admin/server/og-preview.ts` + 发布视图 OG 区）

考察 `scripts/generate-og-images.ts` 后的取舍：脚本主体耦合「全量扫描 + hash 缓存 + 三处落盘（.cache/public/dist）+ sharp 占位 PNG」，单页抽 lib 的投入产出不划算；而卡片视觉完全由 `src/lib/og-image.ts` 的 `generateOgSvg` 决定（脚本生成的 PNG 只是纯色底占位）。因此采用**进程内按需生成 SVG**：

- `GET /api/og-preview?lang=&file=`：用与脚本相同的输入（`ogTitle||title`、`ogDescription||description||站点描述`、`siteTitle`、`lang`、`accent`、`background`）调 `generateOgSvg` 返回 SVG；**不跑构建、不写盘、不依赖 sharp**，永远反映当前配置；
- 页面 frontmatter 自定义 `og_image` 时不生成（与构建期跳过逻辑一致），返回 `{ custom }`，前端给素材直链；
- `file` 只允许裸文件名（basename 比对，防路径穿越）；页面不存在 400；
- 前端：页面下拉 + 「生成预览」→ Blob URL 内联 `<img>` + 「新标签打开」。

## 6. 测试

- `tests/admin-publish.test.ts`：`buildStages` 纯函数；构建状态机（假 spawn：阶段推进/409 冲突/失败含阶段 id/日志缓冲/stop 树杀回 idle）；预览管理（假 probe/createServer：启动参数、幂等、外部接管、dist 缺失报错）；OG 预览（SVG 内容、custom 分支、非法参数）；
- `tests/admin-publications.test.ts`：读（未知字段往返/缺文件/坏 YAML）、校验（缺字段/重复 id/坏 type）、写（快照断言、失败不落盘、缺文件新建）、HTTP GET/PUT 端到端（沿用 admin-configs 快照断言模式）。

## 7. 已知限制

- 构建期间编辑 data/ 不会中断构建，产物以构建开始后的文件读取为准；构建失败需看日志自行修复后重试；
- OG 预览只出 SVG（构建期的 PNG 是纯色占位底，视觉一致）；多文本溢出卡片时不做截断模拟（与构建产物一致，均未做换行排版）；
- dist 预览端口固定 4399，被无关服务占用时会「接管上报」而非换端口（同 dev server 语义）；
- 学术成果表单不提供 `enabled`/`bibtex_file`/`highlight_authors` 顶层字段编辑（保留原值；需要时改 YAML 或用 BibTeX 导入）。

# 18：Admin 数据导入（BibTeX 学术成果 + data.zip 迁移）

> 状态：已实现。范围：后台 BibTeX 一键导入学术成果、data.zip 整包导入迁移。
> 来源：OOTB 总纲 `docs/ootb-experience-optimization-2026-09-04.md`「支柱二」（痛点 #4 Bib 录入累、#7 只出不进）。
> 全局约束：零新增 npm 依赖（zip 解析用内置 `zlib.inflateRawSync`，与 `admin/server/export.ts` 手写 deflate 导出对称）；任何覆盖性写入前必须留快照（`admin/server/snapshots.ts`）；仅监听 127.0.0.1 的本地工具，不引入鉴权。

## 1. 用户目标

- **BibTeX 导入**：从 Zotero / Google Scholar / DBLP 复制或导出的 `.bib` 内容，粘贴或选文件即可变成 `publications.yaml` 条目，免去手写 YAML；导入前可预览，重复条目自动跳过。
- **data.zip 导入**：把别处（另一台机器、旧版本、CI 产物）导出的 `openhomepage-data-*.zip` 一键灌回本地 `data/`，与顶栏「导出 data 压缩包」构成双向迁移；覆盖前自动留存整包安全快照。

## 2. BibTeX 导入

### 2.1 入口与交互

- 侧栏「配置」新增「学术成果」入口（`#/config/publications`），视图内为导入面板：
  1. 粘贴 BibTeX 文本到 `<textarea>`，或点「选择 .bib 文件」（文件内容读入同一 textarea，可继续编辑）；
  2. 点「解析预览」→ `POST /api/import/bibtex/preview`，渲染两组列表：**将新增**（标题 / 年份 / 类型 / venue）与**将跳过**（bib key + 原因：重复 / 缺字段）；
  3. 点「确认导入」→ `POST /api/import/bibtex` 落盘，状态栏提示新增/跳过数量。

### 2.2 解析（`admin/server/import.ts` `parseBibtex`）

零依赖手写的容错解析器，产出 `BibEntry { type, key, fields, raw }`：

- entry 头：`@type{key,` 或 `@type(key,`（圆括号同样合法）；`@string` / `@preamble` / `@comment` 不视为论文条目；
- entry 体按花括号深度截取，允许字段值内嵌套花括号（如 `title = {The {KV} Cache}`）；
- 字段值三种形态：`{...}`（嵌套花括号配平）、`"..."`（容忍 `\"` 转义）、裸 token（数字或未加引号标识符）；
- 值归一化：剥外层括号/引号、剥内层包裹花括号（保留文字）、压缩连续空白；
- 解析失败的 entry 不进列表，进 skipped 并附原因。

### 2.3 字段映射（BibEntry → `publications.yaml` item，schema 见 spec 13 §1.2 与 `src/lib/publications.ts`）

| BibTeX | publications.yaml | 说明 |
|--------|-------------------|------|
| entry 类型 | `type` | `article→journal`；`inproceedings`/`conference→conference`；`phdthesis`/`mastersthesis→thesis`；`misc`/`unpublished`/`online`/`techreport`→`preprint`；其余未识别类型→`preprint` |
| `title` | `title`（必填） | 缺则跳过 |
| `author` | `authors`（必填，非空） | 按 ` and ` 拆分；`Last, First` 形态翻转为 `First Last` |
| `year` | `year`（必填整数） | 缺/非整数则跳过；有 `month`（`jan`–`dec` 或数字）时补 `date: YYYY-MM-01` |
| `journal`/`booktitle`/`publisher`/`school`/`institution`/`organization`/`howpublished` | `venue`（必填） | 按此顺序取首个非空；`eprint`+`archivePrefix=arXiv` 时兜底 `arXiv`；仍为空则跳过（schema 要求 venue 非空） |
| `doi` | `doi`（附加字段） | schema 未定义该字段但渲染端容忍并忽略未知键；保留用于跨次导入去重 |
| `url` | `links.project` | 仅 http(s) 链接 |
| `abstract` | `abstract` | 纯字符串（LocalizedText 允许纯字符串形态） |
| entry key | `bibtex_key` + `id` | `id` 由 key 派生（转小写、非 `[a-z0-9]` 折叠为 `-`），与现有 id 冲突时追加 `-2`/`-3`；key 全非 ASCII 时兜底 `pub-<n>` |

### 2.4 去重策略

满足任一即跳过（在预览的「将跳过」列表中可见）：

1. **DOI 相同**（小写比较）：新条目 `doi` 命中现有 items 的 `doi` 字段，或命中现有 item `links.*` 中以 `https://doi.org/` 开头的链接所携带的 DOI；
2. **标题相同**：忽略大小写、压缩空白后相等；
3. **批次内重复**：同一次粘贴内容里与前述规则冲突的后续条目。

### 2.5 落盘（走既有保存链路）

`POST /api/import/bibtex`：

1. 重跑预览同一套逻辑得到 `added`（保证预览与落盘判定一致）；`added` 为空则只返回计数、不写盘；
2. `createSnapshot(dataDir, 'publications.yaml')` 留快照（文件不存在时跳过快照直接新建）；
3. 合并后 `js-yaml` dump 写回 `publications.yaml`（`enabled`/`bibtex_file`/`highlight_authors` 等既有顶层字段原样保留），`notifyWrite` 接入撤销/重做链；
4. 若配置了 `bibtex_file`（如 `publications.bib`）且文件存在：同样先快照，再把新增条目的原始 BibTeX 文本追加到该 bib 文件末尾——保证 `bibtex_key` 在构建期能被 `loadPublications` 命中（不追加会产生 "key not found" 警告）。

响应 `{ ok, added, skipped: [{ key, reason }] }`。

## 3. data.zip 导入

### 3.1 入口与交互

顶栏「导出 data 压缩包」旁新增「📥 导入 data.zip」按钮 → 隐藏 `<input type="file" accept=".zip">` → 选中后弹确认（说明将覆盖同名文件、且会先留整包快照）→ `POST /api/import-data`（原始二进制 body，与素材上传同通道）→ 状态栏提示导入文件数与快照位置，随后刷新页面。

### 3.2 zip 解析（`parseZip`，与 `export.ts buildZip` 对称）

- 从尾部 64KB 内定位 EOCD（`0x06054b50`），按中央目录（`0x02014b50`）逐条读取——以中央目录为准而非顺序扫本地头，兼容带 data descriptor 的外部 zip；
- 文件名按 UTF-8 解码（本工具导出包带 `0x0800` 标记位；外部 zip 的 CP437 中文名不保证正确，见「已知限制」）；
- 压缩方法支持 `8`（deflate，`zlib.inflateRawSync`）与 `0`（store，直接截取）；其余（加密、bzip2 等）报错拒绝；
- 目录条目（名字以 `/` 结尾）跳过。

### 3.3 安全校验

每个条目名写入前过 `safeResolve(dataDir, name)`（`admin/server/paths.ts`）：拒绝 `..`、绝对路径、盘符、反斜杠、`%`、空段、NUL；任一条目非法则整个包拒绝（HTTP 400），不落任何文件。

### 3.4 快照与覆盖

1. 覆盖前把当前 `data/`（**不含** `.snapshots/`，避免快照套快照膨胀）整体打包为 `data/.snapshots/import-backup/<yyyyMMddTHHmmssSSS>.zip`（复用 `collectDataEntries` + `buildZip`）；该备份本身可再次通过本导入功能灌回，形成自救回路；
2. 逐条 `mkdir -p` + 写文件**覆盖**同名文件；zip 中不存在的本地文件**不删除**（overlay 语义：保留导入后新增的内容；需要完全还原时先自行清空 `data/` 再导入）；
3. 响应 `{ ok, files, backup }`：`files` 为写入条目数，`backup` 为快照包相对路径。

### 3.5 HTTP 端点汇总

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| POST | `/api/import-data` | zip 原始二进制（≤20MB，复用素材上传上限） | `{ ok, files, backup }` |
| POST | `/api/import/bibtex/preview` | `{ bibtex: string }` | `{ added: Item[], skipped: [{ key, reason }] }` |
| POST | `/api/import/bibtex` | `{ bibtex: string }` | `{ ok, added, skipped }` |

## 4. 测试（`tests/admin-import.test.ts`）

- `parseZip`：`buildZip` 构建 → 解析往返（含中文文件名、二进制内容、store 方法条目）；
- 路径安全：`../evil.yaml`、`/abs/x`、`C:\x`、`a\b` 等条目整个包拒绝且不落盘；
- `POST /api/import-data`：覆盖写生效、`.snapshots/import-backup/` 生成备份、返回文件数；
- `parseBibtex`：`article`/`inproceedings`/`misc`/`phdthesis` 类型映射、引号字段、嵌套花括号、`@string`/`@comment` 忽略、`Last, First` 作者翻转；
- 合并去重：DOI 相同跳过、标题相同跳过、批次内重复跳过；确认写盘后 publications.yaml 内容正确且 `.snapshots/publications.yaml/` 有快照；配置 `bibtex_file` 时原始 entry 追加到 bib 文件。

## 5. 已知限制

- 外部工具生成的 zip 若文件名非 UTF-8 且无 `0x0800` 标记（Windows 资源管理器对中文名常见），文件名可能乱码；本工具自产导出包不受影响；
- zip 导入为 overlay 覆盖语义，不删除多余文件；整包备份不含历史 `.snapshots/`；
- BibTeX 不展开 `@string` 宏与交叉引用（`crossref`）；`month` 仅识别英文三字母缩写与数字；
- 导入条目不自动生成 `tags`/`badges`/`teaser`/`note`，需导入后在 YAML 中手动补充；
- `venue` 无法从任何已知字段确定时条目被跳过而非猜测填充。

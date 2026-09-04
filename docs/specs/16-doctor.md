# Doctor 健康自检（细化项 #16）

> 状态：✅ 已实现。核心检查逻辑在 `scripts/doctor-lib.ts`（纯函数，vitest 覆盖），
> CLI 入口 `scripts/doctor.ts`，经 `npm run doctor`（tsx）运行。
> 需求来源：`docs/ootb-experience-optimization-2026-09-04.md` 支柱三。

## 1. 目标与用法

一体化本地健康检查：在 `npm run dev` / `build` 之前暴露配置、素材引用与指令语法问题，
退出码可供 CI / prebuild 接入。

```bash
npm run doctor            # 默认离线：不发起任何网络请求
npm run doctor -- --online   # 追加外部接口检查（GitHub API、RSS 源）
npm run doctor -- --offline  # 显式离线（与默认等价）
```

## 2. 检查项

### 2.1 运行环境

- Node.js 版本 ≥ 18.17.0（项目依赖 tsx / Astro 的最低运行时基线）。
- 不满足 → ✗ 致命。

### 2.2 数据目录

- `data/` 存在 → ✓；缺失但 `data.example/` 存在 → !（提示本次检查基于示例数据回退，
  与 `src/lib/data-dir.ts` 构建回退一致），并建议 `npm run setup`；两者都缺失 → ✗。
- `data/` 缺失（回退示例）时，后续所有数据类检查针对回退目录执行。

### 2.3 配置文件

- `site.yaml`：可解析（js-yaml）且通过 `validateSiteConfig()`（必需字段
  `site.title` / `profile.name` / `github.username`，复用 `src/lib/config.ts`）。
  文件缺失 / YAML 语法错误 / 必需字段缺失 → ✗。
- `rss.yaml`：`site.yaml` 配置了 `rss` 段且未显式 `enabled: false` 时必需；
  存在时通过 `validateRssConfig()` 校验（复用 `src/lib/config.ts`）。
  缺失（启用中）/ 语法错误 / 校验失败 → ✗。
- `publications.yaml`：存在时经 `loadPublications()` 校验（复用
  `src/lib/publications.ts`，含 items 必需字段与 BibTeX 合并告警）；
  解析或字段错误 → ✗；文件不存在 → 跳过（`::publications` 指令才需要它，记 [–]）。

### 2.4 语言与页面

- `pages/` 目录缺失 → ✗；存在但无任何语言目录 → ✗。
- 语言目录名非法（不符合 2–3 位小写字母语言码，见 `src/lib/language.ts`）→ !。
- 语言目录下无 `.md` 页面 → !（该目录对构建不可见，疑似误建）。
- 主语言 = `normalizeSiteLanguage(site.language)`：
  - `site.language` 缺失或非法 → !（构建回退为首个可用语言）；
  - 主语言在 `pages/` 下无目录 → ✗（构建会把默认语言静默换成其他语言，
    无前缀 URL 的内容整个变掉）；
  - 主语言目录缺 `index.md` → !（主页将按回退链渲染其他语言版本）。

### 2.5 本地素材引用

- 扫描范围：`pages/**/*.md`、`streaming/**/*.md`、`site.yaml`、`rss.yaml`、
  `publications.yaml`。
- Markdown 中提取两类引用：图片/链接目标 `![alt](assets/...)`、
  指令与 raw HTML 属性 `src|poster|cover|href="assets/..."`；fenced code block
  内的内容不计入。
- YAML 中提取值位出现的 `assets/...` 路径（要求带文件扩展名，避免误伤散文）。
- 统一归一化：去掉 `./` 前缀与 query/hash；**跳过 `assets/remote/`**
  （远程媒体本地化产物，构建期下载生成，见 spec 03 §1）。
- 引用文件在 `<dataDir>/assets/` 下不存在 → ✗，逐条列出 `文件:行号` 与建议
  （确认文件已放入 `data/assets/` 或修正路径，注意大小写敏感）。
- 该检查用于构建前拦截失效引用（OOTB 验收标准之一），故定为 ✗。

### 2.6 指令语法（容器配平）

- 校验 `:::`/`::::` 等容器指令的开合配平（纯文本行级扫描， fenced code block 与
  frontmatter 内不计）：
  - 开启行 `^:{3,}name` 入栈；闭合行 `^:{3,}$` 闭合栈顶；
  - 闭合冒号数 < 栈顶开启冒号数 → ✗（违反 spec 03 §2「外层冒号数必须多于内层」，
    remark-directive 会产生残留 `:::` 段落）；
  - 无开启的裸闭合 → ✗；文件结束仍有未闭合容器 → ✗。
- `::name` 叶子指令无闭合概念，不参与配平。
- 每个问题列出 `文件:行号` 与修正建议。

### 2.7 外部接口（仅 `--online`）

- GitHub API：GET `https://api.github.com/`，带超时（8s）与 `User-Agent`；
  2xx → ✓（附 `x-ratelimit-remaining` 额度）；403 且额度为 0 → !（建议配置
  `GH_PAT`）；其他状态 / 网络失败 / 超时 → !。网络问题不影响本地构建，一律 !。
- RSS 源：对 `rss.yaml` 每个源 GET 探测（同源超时），2xx/3xx → ✓，
  其余 → !（附状态码或错误原因）。
- 默认离线时本节输出 [–]「已跳过」，提示 `--online` 启用。

### 2.8 端口占用

- 探测 4321（Astro dev）与 4174（admin 后台）：尝试在 `127.0.0.1` 上绑定，
  `EADDRINUSE` 判定占用。
- 空闲 → ✓；占用 → !（若是正在运行的 dev/admin server 属预期，否则提示释放端口）。

## 3. 输出与退出码

```
OpenHomepage Doctor
数据目录：data/

【运行环境】
  [✓] Node.js v22.x（要求 ≥ 18.17.0）
【配置文件】
  [✓] site.yaml 可解析，必需字段齐全
  ...
```

- 分级图标：`[✓]` 通过、`[!]` 警告、`[✗]` 致命、`[–]` 跳过（未启用/不适用）。
- 每个非 ✓ 项附中文建议（`→ 建议：…`）。
- 末尾中文汇总：`检查完成：N 项通过，M 个警告，K 个错误。`
- **退出码**：存在任一 ✗ → `1`；仅 ! / 全 ✓ → `0`。可接入 CI / prebuild。

## 4. 实现结构

- `scripts/doctor-lib.ts`：全部检查逻辑。纯函数（`checkNodeVersion` /
  `extractAssetRefs` / `checkDirectiveBalance` 等）+ 注入 IO 的异步检查
  （`probePort` / `checkGithubApi` / `checkRssSources` 支持注入 fetch 与端口探测函数），
  由 `runDoctor(options)` 编排为 `DoctorReport`。复用 `src/lib/config.ts` 的
  `validateSiteConfig` / `validateRssConfig`、`src/lib/publications.ts` 的
  `loadPublications`、`src/lib/language.ts` 的 `normalizeSiteLanguage`，零新增依赖。
- `scripts/doctor.ts`：仅做参数解析（`--online` / `--offline` / `--help`）、
  报告渲染与退出码设置，无业务逻辑。
- `tests/doctor.test.ts`：vitest，临时目录构造 fixtures，覆盖素材失效检测、
  指令不配平、语言目录缺失、配置错误、健康数据全通过、端口与网络注入替身等路径。

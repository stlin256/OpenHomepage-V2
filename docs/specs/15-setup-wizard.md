# 15：交互式 CLI 初始化向导（2026-09-04）

> 状态：已实现。范围：`npm run setup` 从静默全量复制升级为三模式交互向导。
> 总纲：`docs/ootb-experience-optimization-2026-09-04.md` 支柱一。
> 约束：纯 Node 实现（`node:readline` + 已有依赖 `js-yaml`），零新增依赖；`package.json` 的 `setup` 入口（`node scripts/setup.mjs`）不变；不触碰 `admin/`、`src/`、README、AGENTS.md。

## 1. 用户目标

新用户 `git clone → npm install → npm run setup` 后，不再被四语全量演示数据淹没，而是：

1. 30 秒内通过向导生成只含自己语言、自己姓名与所选模块的 `data/`；
2. 或一键复制完整示例站（等同旧行为）；
3. 或生成最小空白骨架从零写起。

## 2. 三模式

### 2.1 ⚡ 快速向导（quick）

交互收集：

| 问题 | 落到哪里 |
|------|---------|
| 姓名（中文） | `profile.name.zh`、`site.title.zh` |
| 姓名（英文） | `profile.name.en`、`site.title.en` |
| Tagline（中文） | `profile.tagline.zh` |
| Tagline（英文） | `profile.tagline.en` |
| GitHub 用户名 | `github.username`（仅写配置；**不拉取网络**，API 预填为后续项） |
| 语言体系 | 仅中文 `['zh']` / 仅英文 `['en']` / 中英双语 `['zh','en']` / 四语 `['zh','en','ja','fr']` |
| 模块勾选 | 学术成果 publications、GitHub 卡片 github、RSS、BGM、二维码联系 contact（默认全选） |

生成流程（`generateQuickData`）：

1. `cpSync(data.example → data)` 全量复制作为基底；
2. 删除未选中语言的 `pages/<lang>/` 与 `streaming/<lang>/` 目录（站点语言由 `pages/` 子目录扫描驱动，见 `src/lib/config.ts` `loadPages`/`detectLanguages`）；
3. 读取 `data/site.yaml`（js-yaml），按选项变换后重写：
   - 递归裁剪多语言映射（所有 key 均为语言码的对象只保留选中语言；裁剪后为空则保留首个可用语言兜底，避免空字符串）；
   - 写入姓名 / Tagline / `github.username`；
   - `site.language` 设为首个选中语言（zh → `zh-CN`，其余 → 语言码本身）；
   - 模块关闭时：rss → 删 `rss:` 段；bgm → 删 `bgm:` 段；contact → 删 `contact:` 段；github → 保留最小 `{ username }`（`validateSiteConfig` 要求 `github.username` 必填，不能整段删除）；publications → site.yaml 无对应段，仅删文件与指令；
   - `home.layout` 中移除被关闭模块对应的 `github` / `rss` 区块项；
4. 模块关闭时清理文件与页面指令：
   - publications → 删 `publications.yaml`、`publications.bib`，并从剩余页面剥离 `::publications{...}` 行；
   - github → 从剩余页面剥离 `:::ghcard{...}` 行；
   - rss → 删 `rss.yaml`；
5. 重写后的 `site.yaml` 不保留原注释（js-yaml dump 的固有限制，可接受）。

不裁剪 `assets/`（多余素材无害，按引用裁剪列为后续项）。

### 2.2 📦 完整示例（example）

等同旧行为：`cpSync(data.example → data)`，逐字节保留，不重写任何文件。

### 2.3 📄 纯净空白（blank）

最小骨架，不依赖 `data.example/`：

- `site.yaml`：`site.title`、`profile.name`（单语言）、`github.username` 占位符（必填校验要求）；
- `pages/<lang>/index.md`：含 `title`/`nav`/`order` frontmatter 与一段占位正文；默认 `zh`，可由参数指定。

## 3. 非交互回退与跳过语义

- `data/` 已存在：打印「已存在，跳过」，退出码 0，三模式均不触发——**旧语义完全保留**。
- 以下任一成立即非交互，不启动向导：
  - `!process.stdin.isTTY`（管道 / 重定向）；
  - 环境变量 `CI=true`；
  - 命令行参数 `--example` / `--blank` / `--yes`。
- 非交互默认（无参数 / `--yes`）回退为旧行为「复制完整示例」，保证 CI 与既有脚本 100% 兼容；`--example`、`--blank` 显式选择对应模式。

## 4. 模块划分

- `scripts/setup-lib.mjs`：可 import 的核心逻辑，全部路径以参数注入，不读 `process.*`：
  - `KNOWN_LANGS`、`LANG_TO_SITE_LANGUAGE`；
  - `parseCliArgs(argv)`、`isNonInteractive({ isTTY, env, args })`（纯函数）；
  - `trimLangMaps(node, langs)`、`transformSiteConfig(cfg, options)`、`stripModuleDirectives(markdown, names)`（纯函数）；
  - `generateQuickData(options, { exampleDir, destDir })`、`generateBlankData(destDir, { lang })`、`copyExampleData(exampleDir, destDir)`；
  - `runSetup({ rootDir, argv, env, isTTY, ask })`：跳过判断 → 参数/非交互分流 → 交互时调用注入的 `ask` 收集选项；返回 `{ mode: 'skipped' | 'example' | 'blank' | 'quick' }`。
- `scripts/setup.mjs`：薄 CLI 层，仅负责 `node:readline/promises` 问答（实现 `ask`）与终端输出，不含业务逻辑。

## 5. TDD 验收用例（`tests/setup-wizard.test.ts`，vitest，临时目录隔离）

1. 选项→目录结构：quick 模式选 `['zh','en']` 后 `pages/` 仅含 zh/en，`streaming/` 仅含 zh/en；
2. 语言裁剪：生成的 `site.yaml` 中 `site.title`/`profile.tagline` 等映射只含选中语言 key；
3. 个性化写入：姓名 / Tagline / GitHub 用户名落入 `site.yaml`，且通过 `src/lib/config.ts` 的 `loadSiteConfig` 校验；
4. 模块裁剪：关闭 publications+github+rss+bgm+contact 后，对应文件被删、`::publications`/`::ghcard` 指令行被剥离、`home.layout` 无 github/rss 项、`github` 段保留最小 `username`；
5. 非交互回退：`isTTY=false` / `CI=true` / `--yes` 均走完整示例复制；`--blank` 走空白骨架；
6. 已存在跳过：`data/` 已存在时返回 `skipped` 且不改动目录内容；
7. blank 骨架：`site.yaml` + `pages/zh/index.md` 存在且通过 `loadSiteConfig` 校验。

## 6. 已知限制与后续项

- GitHub 用户名只写配置，不调用 GitHub API 预填姓名/头像（后续项，需联网与 rate limit 处理）。
- quick 模式重写 `site.yaml` 后原文件注释丢失；example 模式不受影响。
- `assets/` 不随模块/语言裁剪，未引用素材留在目录中（后续可做引用扫描裁剪）。
- 场景化预设（Scholar / Developer / Creator / Minimal）作为向导的模块勾选预设内置，后续迭代落地（见总纲支柱四）。

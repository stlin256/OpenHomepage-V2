# 15：交互式 CLI 初始化向导（2026-09-04）

> 状态：已实现。范围：`npm run setup` 从静默全量复制升级为三模式交互向导；快速向导内置 GitHub API 预填与场景化预设。
> 总纲：`docs/ootb-experience-optimization-2026-09-04.md` 支柱一（预填与预设对应支柱四，随向导落地）。
> 约束：纯 Node 实现（`node:readline` + 全局 `fetch` + 已有依赖 `js-yaml`），零新增依赖；`package.json` 的 `setup` 入口（`node scripts/setup.mjs`）不变；不触碰 `admin/`、`src/`、README、AGENTS.md。

## 1. 用户目标

新用户 `git clone → npm install → npm run setup` 后，不再被四语全量演示数据淹没，而是：

1. 30 秒内通过向导生成只含自己语言、自己姓名与所选模块的 `data/`；
2. 或一键复制完整示例站（等同旧行为）；
3. 或生成最小空白骨架从零写起。

## 2. 三模式

### 2.1 ⚡ 快速向导（quick）

交互收集（按提问顺序）：

| 步骤 | 问题 | 落到哪里 |
|------|------|---------|
| ① | 场景预设 | 仅作为 ④⑤ 的默认值（见 §2.1.2），不直接写配置 |
| ② | GitHub 用户名 | `github.username`；非空时触发 API 预填（见 §2.1.1） |
| ③ | 姓名（中文 / 英文） | `profile.name.zh/en`、`site.title.zh/en`；默认值为预填 `name`（中文项仅当含 CJK 字符） |
| ③ | Tagline（中文 / 英文） | `profile.tagline.zh/en`；默认值为预填 `bio`（中文项仅当含 CJK 字符） |
| ③ | 个人网站 | 去重后写入 `profile.links` 首位 `{ label: "Website", url }`；默认值为预填 `blog` |
| ④ | 语言体系 | 仅中文 `['zh']` / 仅英文 `['en']` / 中英双语 `['zh','en']` / 四语 `['zh','en','ja','fr']`；默认选项来自场景预设 |
| ⑤ | 模块勾选 | 学术成果 publications、GitHub 卡片 github、RSS、BGM、二维码联系 contact；逐项 Y/n 默认值来自场景预设 |

所有带默认值的提问：直接回车采纳默认值，输入任意内容即覆盖。

#### 2.1.1 GitHub API 预填

- **触发条件**：仅交互式快速向导、且用户输入了非空 GitHub 用户名。非交互回退（`!isTTY` / `CI=true` / `--example|--blank|--yes`）绝不触网。
- **请求**：`GET https://api.github.com/users/<username>`（`encodeURIComponent` 转义），请求头 `User-Agent: openhomepage-v2-setup`、`Accept: application/vnd.github+json`；`AbortController` 5 秒超时（`GITHUB_API_TIMEOUT_MS`）。
- **成功**：取 `name` / `bio` / `blog` 作为 ③ 各提问的默认值（缺失字段视为空字符串）。`name`/`bio` 仅当含 CJK 字符时才同时作为中文提问默认值，避免把英文 bio 塞进中文 Tagline。
- **降级语义**：网络错误、非 200（含 404 / rate limit 403）、超时 abort、JSON 解析异常、`fetch` 不可用——一律静默返回 `null`，打印一行「未获取到，继续手动填写」，向导照常继续，**绝不阻断、绝不抛出**。
- **实现**：`fetchGithubProfile(username, { fetchImpl, timeoutMs })`（`scripts/setup-lib.mjs`），`fetchImpl` 可注入替身以便测试；CLI 层默认用全局 `fetch`。

#### 2.1.2 场景化预设（总纲支柱四）

预设是「模块勾选 + 语言建议」的**纯默认值**，用户随后逐项确认时仍可覆盖；不作为独立模板目录维护。

| Key | 预设 | modules（publications / github / rss / bgm / contact） | 建议语言 |
|-----|------|--------------------------------------------------------|----------|
| `academic` | 🎓 学术科研型 | ✅ / ✅ / ✅ / ❌ / ✅ | `['zh','en']` |
| `developer` | 💻 开发者与开源作者 | ❌ / ✅ / ❌ / ❌ / ✅ | `['zh','en']` |
| `creator` | 🎨 创作者与摄影博主 | ❌ / ❌ / ❌ / ✅ / ✅ | `['zh']` |
| `minimal` | ⚡ 极简纯净名片 | ❌ / ❌ / ❌ / ❌ / ✅ | `['zh']` |
| `custom` | 🛠️ 自定义（现状全手动，默认项） | ✅ 全开 | `['zh','en']` |

> 映射只覆盖 `MODULE_KEYS` 五个可裁剪模块：经历时间轴、画廊、流式块（`::stream`）均为示例页面与 `editorial_blocks` 自带内容，不参与模块裁剪，任何预设下都保留。

实现：`SCENE_PRESETS`（纯数据表）、`SCENE_PRESET_KEYS`（展示顺序）、`resolveScenePreset(key)`（未知 key 回退 `custom`，返回深拷贝）、`langPresetKeyFor(langs)`（语言数组 → `LANG_PRESETS` key 反查，用于设置语言提问的默认选项）。向导中自定义为默认选项（直接回车 = 现状全手动），与本次改动前的默认行为一致。

生成流程（`generateQuickData`）：

1. `cpSync(data.example → data)` 全量复制作为基底；
2. 删除未选中语言的 `pages/<lang>/` 与 `streaming/<lang>/` 目录（站点语言由 `pages/` 子目录扫描驱动，见 `src/lib/config.ts` `loadPages`/`detectLanguages`）；
3. 读取 `data/site.yaml`（js-yaml），按选项变换后重写：
   - 递归裁剪多语言映射（所有 key 均为语言码的对象只保留选中语言；裁剪后为空则保留首个可用语言兜底，避免空字符串）；
   - 写入姓名 / Tagline / `github.username`；`website` 非空时去重后置入 `profile.links` 首位；
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
  - `KNOWN_LANGS`、`LANG_TO_SITE_LANGUAGE`、`LANG_PRESETS`、`MODULE_KEYS`、`GITHUB_USERNAME_PLACEHOLDER`；
  - `SCENE_PRESETS`、`SCENE_PRESET_KEYS`、`resolveScenePreset(key)`、`langPresetKeyFor(langs)`（场景化预设，纯数据表 + 纯函数）；
  - `fetchGithubProfile(username, { fetchImpl, timeoutMs })`、`GITHUB_API_TIMEOUT_MS`（GitHub API 预填，fetch 可注入，失败静默返回 `null`）；
  - `parseCliArgs(argv)`、`isNonInteractive({ isTTY, env, args })`（纯函数）；
  - `trimLangMaps(node, langs)`、`transformSiteConfig(cfg, options)`、`stripModuleDirectives(markdown, names)`（纯函数）；
  - `generateQuickData(options, { exampleDir, destDir })`、`generateBlankData(destDir, { lang })`、`copyExampleData(exampleDir, destDir)`；
  - `runSetup({ rootDir, argv, env, isTTY, ask })`：跳过判断 → 参数/非交互分流 → 交互时调用注入的 `ask` 收集选项；返回 `{ mode: 'skipped' | 'example' | 'blank' | 'quick' }`。
- `scripts/setup.mjs`：薄 CLI 层，仅负责 `node:readline/promises` 问答（实现 `ask`）与终端输出，不含业务逻辑。快速向导提问顺序：场景预设 → GitHub 用户名（触发预填）→ 姓名/Tagline/个人网站（预填值为默认值）→ 语言体系 → 模块勾选。

## 5. TDD 验收用例（`tests/setup-wizard.test.ts`，vitest，临时目录隔离）

1. 选项→目录结构：quick 模式选 `['zh','en']` 后 `pages/` 仅含 zh/en，`streaming/` 仅含 zh/en；
2. 语言裁剪：生成的 `site.yaml` 中 `site.title`/`profile.tagline` 等映射只含选中语言 key；
3. 个性化写入：姓名 / Tagline / GitHub 用户名落入 `site.yaml`，且通过 `src/lib/config.ts` 的 `loadSiteConfig` 校验；
4. 模块裁剪：关闭 publications+github+rss+bgm+contact 后，对应文件被删、`::publications`/`::ghcard` 指令行被剥离、`home.layout` 无 github/rss 项、`github` 段保留最小 `username`；
5. 非交互回退：`isTTY=false` / `CI=true` / `--yes` 均走完整示例复制；`--blank` 走空白骨架；
6. 已存在跳过：`data/` 已存在时返回 `skipped` 且不改动目录内容；
7. blank 骨架：`site.yaml` + `pages/zh/index.md` 存在且通过 `loadSiteConfig` 校验；
8. GitHub 预填：注入 fetch 替身覆盖成功（URL / User-Agent / 字段映射）/ 404 / 超时 abort / 网络错误 / 空用户名 / 无 fetch，失败路径全部返回 `null` 不抛出；
9. 场景化预设：`SCENE_PRESETS` 五预设映射表与 `MODULE_KEYS` 全键覆盖、`resolveScenePreset` 未知 key 回退 `custom` 且返回深拷贝、`langPresetKeyFor` 反查；
10. 预设可覆盖：minimal 预设默认值被用户逐项覆盖（手动开 github、改中英双语）后 `transformSiteConfig` 结果以覆盖值为准；
11. 个人网站写入：`website` 去重后置入 `profile.links` 首位，留空不动 links。

## 6. 已知限制与后续项

- 预填只读取 GitHub 公开资料的 `name` / `bio` / `blog`；头像（`avatar_url`）不落盘（需下载素材，列为后续项）。
- 预填的失败对用户只显示一行提示，不区分 404 / 超时 / 网络错误的具体原因（rate limit 细节可由 `npm run doctor --online` 排查）。
- 场景化预设只覆盖模块勾选与语言建议；页面内容（时间轴 / 画廊 / 流式块文案）不随预设改写。
- quick 模式重写 `site.yaml` 后原文件注释丢失；example 模式不受影响。
- `assets/` 不随模块/语言裁剪，未引用素材留在目录中（后续可做引用扫描裁剪）。

# 22：部署引导与新手向导统一（规格）

> 状态：已实现。
> 来源：OOTB 总纲 `docs/ootb-experience-optimization-2026-09-04.md` 的收尾断档——用户导出 data.zip 后要上线真实内容，需自行托管 zip 拿直链、再到仓库 Settings 手工配 Secrets（`DATA_SOURCE_URL` / `GH_PAT` / `ENABLE_EXAMPLE`），全程无引导。
> 全局约束：零新增 npm 依赖；界面文案中英双语（`admin/shared/i18n.ts`）；仓库地址解析逻辑服务端与前端共用一份（`admin/shared/deploy.ts`）；场景预设数据 CLI 与 admin 共用一份（`scripts/scene-presets.mjs`）。

## 1. 用户目标

- 在后台顶栏点「🚀 部署到线上」，跟着四步检查清单把本地 data/ 发布上线，不再翻 README 找 secrets 名称。
- 新手向导首步选场景，后续模块勾选自动带上合理默认值；语言裁剪不被遗忘——完成页直达「语言管理」。
- `npm run doctor -- --online` 在限流 / 401 / 未配 token 时直接给出 token 生成页链接与所需 scope。

## 2. 「部署到线上」引导卡片

### 2.1 入口与界面

- 顶栏「导出 data 压缩包」旁新增「🚀 部署到线上」按钮（`admin/ui/main.ts`），打开 `admin/ui/views/deploy.ts` 的清单卡片（复用 `.modal-overlay` / `.onboarding-modal` 结构，新增 `.deploy-*` 补充类；Esc / 点遮罩关闭，纯指引不落盘）。
- 四步清单：①导出 data.zip（内嵌既有 `GET /api/export-data` 下载链接）→ ②托管 zip 拿直链（私有仓库 Release / Secret Gist / 对象存储预签名 URL 三途径，附隐私提醒：zip 含私人数据、直链即钥匙）→ ③配置仓库 Secrets（`DATA_SOURCE_URL` / `GH_PAT` / `ENABLE_EXAMPLE` 逐项说明 + 设置页 deep link + GH_PAT 生成页链接）→ ④触发并观察 Actions 部署（含首次部署需开 Pages 的提示）。

### 2.2 仓库地址探测与降级

- `GET /api/deploy-info`（`admin/server/deploy-info.ts`）：服务端 `git remote get-url origin`（5s 超时，exec 可注入）解析 GitHub 仓库地址，返回 `{ repoUrl, secretsUrl, actionsUrl, newTokenUrl }`。
- 读不到（非 git 仓库 / 无 origin / 非 GitHub 托管）时 `repoUrl` 系字段全为 `null`（`newTokenUrl` 恒有值），前端降级为手填仓库地址输入框，输入即解析并生成同样的 deep link——纯前端拼接，与服务端同一套 `githubWebUrl` / `deployLinks`（`admin/shared/deploy.ts`）。
- 解析支持 `https://github.com/o/r(.git)`、`git@github.com:o/r(.git)`、`ssh://git@github.com/o/r(.git)` 与末尾斜杠。

## 3. 新手向导第 0 步「场景预设」

### 3.1 单一数据源

- `SCENE_PRESETS` / `SCENE_PRESET_KEYS` / `LANG_PRESETS` / `resolveScenePreset` / `langPresetKeyFor` 从 `scripts/setup-lib.mjs` 抽到 **`scripts/scene-presets.mjs`**（纯 JS + `scene-presets.d.mts` 类型声明）：`npm run setup` 以纯 node 运行无法 import TS，admin 侧（TS）与 CLI 侧共享该 .mjs，避免两份漂移。`setup-lib.mjs` 原样 re-export，CLI 行为与对外 API 不变。

### 3.2 向导行为（`admin/ui/views/onboarding.ts`）

- 向导由三步扩为四步：**场景预设 → 个人名片 → 模块编排 → 主题色盘**（进度 `第 n / 4 步`）。
- 第 0 步为单选卡片列表（`.scene-card`，默认选中「自定义」）。选定后 `sceneDefaults(key)`（`admin/shared/scene-presets.ts`）把预设映射为向导默认值：github/rss → 第 2 步模块复选框；bgm/contact → 「其他功能」开关；`suggestedLangs` 仅展示在场景描述文案中。
- 默认值在进入第 2 步首次渲染时消费（`pendingScene` 消费后置空）：回退再进不覆盖用户已改勾选；`custom` 与未知 key 返回 `null`——保持当前配置不动（现状全手动）。
- `publications` 不参与映射：它是 CLI 的文件级裁剪（删 publications.yaml/.bib），admin 向导不动文件。
- **语言裁剪不做进向导**：第 3 步（完成页）末尾给「前往语言管理 →」链接，点击 = 保存当前步 + 写完成标记 + 跳转 `#/config/languages`（归档式停用，见 spec 19 §4）。

## 4. doctor 的 GH_PAT 配置引导

- `scripts/doctor-lib.ts` 新增 `GITHUB_TOKEN_GUIDE_URL`（https://github.com/settings/tokens）与统一引导文案（scope：`read:user`；本地配 `GH_PAT` 环境变量、线上配同名仓库 Secret）。
- `checkGithubApi`：403 rate limit 的建议追加引导链接；新增 401 分支（Token 无效/过期）。
- `runDoctor --online` 的外部接口节首项新增 `checkGithubTokenEnv`（`DoctorOptions.env` 可注入，缺省 `process.env`）：`GH_PAT` / `GITHUB_TOKEN` / `GH_TOKEN` 任一存在 → ok；全缺（或空串）→ warn 附引导链接。
- `README.md` / `README.zh-CN.md` 的 Secrets 小节同步补 token 生成页链接与后台「🚀 部署到线上」引导入口。

## 5. 测试

| 文件 | 覆盖 |
|------|------|
| `tests/admin-deploy-info.test.ts` | `githubWebUrl` 各写法/非法输入；`deployLinks`；`readDeployInfo` 注入 exec（命中 / 抛错降级 / 非 GitHub）；`GET /api/deploy-info` 在非 git 目录返回全 null 降级（不触网） |
| `tests/admin-scene-presets.test.ts` | `sceneDefaults` 映射与 custom/未知 key 的 null 语义；admin 与 CLI 预设数据同一份的防漂移守护 |
| `tests/doctor.test.ts`（追加） | 限流/401 建议含 token 链接与 read:user；`checkGithubTokenEnv` 三变量/空串/缺失；`runDoctor --online` 未配 token 首项 warn（`env` 注入，不触网） |

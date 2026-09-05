# AGENTS.md

本文件记录供 AI 协作代理参考的约定与说明。

## 版本号维护机制（Version Maintenance Policy）

- **唯一事实来源**：`package.json` 的 `version` 字段。任何文件（含本文件）都不再硬编码版本号。
- **派生机制**：
  - `package-lock.json`、发版提交与 Git tag（`v*`）由 `npm version` 自动生成。
  - About 页面版本胶囊不写死：示例内容 `data.example/pages/<lang>/about.md` 使用 `v{{version}}` 占位符，构建期由 `src/lib/version.ts` 的 `substituteVersion()` 在 `renderMarkdown` 与搜索索引处注入。用户自己的 `data/pages/` 内容同样可使用该占位符。
  - `scripts/sync-version.mjs` 挂在 `package.json` 的 `version` 生命周期钩子上，发版时校验 lock 一致性并把示例内容中残留的硬编码版本胶囊自愈为占位符。
- **更新原则与请示机制**：
  - **更新版本号必须主动请示用户**，获得明确确认后方可递增版本或打新 tag。
  - **默认不自动更新版本号**：即使进行了常规功能迭代、样式修复、性能优化或文档更新，也保持当前版本号不变，除非用户明确要求发版或升级版本。
  - 经用户指示发版时，标准流程为：`npm version patch|minor|major -m "Release v%s"`（自动改 package.json/lock、跑 sync-version 钩子、生成发版提交与 `v*` tag），随后 `git push --follow-tags`。禁止手改 `version` 字段或手动打 tag。

## Release Note 规范（GitHub Releases）

- **载体**：发版 tag（`v*`）推送后，用 `gh release create <tag>` 创建 GitHub Release；修改用 `gh release edit <tag>`。不维护仓库内 CHANGELOG 文件。
- **标题**：纯英文，格式 `vX.Y.Z — Short English Title`（如 `v0.3.0 — Quality Gate & Publish Loop`）。
- **正文**：中英双语，`## English` 在前、`## 中文` 在后，中间以 `---` 分隔；两版小节结构一一对应。
- **内容组织**：按主题分组归纳（如功能体系 / 体验增强 / 工程化 / 重构），不逐条罗列 commit；首个版本可按大主题概括整个历史。
- **latest 标记**：仅最新版本带 `Latest`；补发历史版本 Release 时用 `--latest=false`。

## 质量门禁与依赖治理（2026-09-05 落地）

- **CI**：`.github/workflows/ci.yml`（push 到 main/master 与所有 PR 触发），两个并行 job：`quality-gate`（`npm run lint` → `npm run check` → `npm run test:coverage`）与 `e2e-smoke`（轻量构建 → Playwright 冒烟）。部署流（deploy.yml）不跑门禁，两者独立。
- **本地提交前必跑三件套**：`npm run lint`（ESLint flat 配置 `eslint.config.mjs`：js/ts/astro recommended，globals 按目录分浏览器/Node，仅 3 条规则针对性放宽）、`npm run check`（astro check，依赖 devDep `@astrojs/check`）、`npm test`（vitest run）。
- **覆盖率门槛制度化（2026-09-05 落地）**：`vitest.config.ts` 断言 lines/statements/functions ≥90、branches ≥80（branches 暂卡 80 防退化，后续补测再提）；CI 跑 `npm run test:coverage`，本地自查同命令。vitest `include` 已收紧为 `tests/**/*.test.ts`，`e2e/*.spec.ts` 归 Playwright。
- **e2e 冒烟（2026-09-05 落地）**：`e2e/smoke.spec.ts`（4 条：首页/语言切换/搜索/内容页），`npm run test:e2e` 跑 Playwright（`playwright.config.ts`，webServer 用 astro preview 直出 dist/）。运行前需先构建（`tsx scripts/generate-fonts.ts && npx astro build` 或完整 `npm run build`）；断言刻意宽松不绑文案。浏览器二进制走 `PLAYWRIGHT_BROWSERS_PATH=0`（node_modules 内，同 screenshots.ts 约定），CI 用 `ASTRO_BASE='/'` 固定根 base；`@playwright/test` 版本须与 `playwright` 保持同步。
- **typescript 固定 ^6**：`@astrojs/check` 的 peer 仅支持 TS ^5||^6；TS7 为原生移植版、无语言服务 API，astro check 无法工作，勿升级 typescript 到 7。
- **data/ 播种兜底**：`tests/search.test.ts` 等用例依赖 `data/`（git 忽略的私有目录）；CI 在测试前执行 `test -d data || cp -r data.example data`（与 deploy.yml 示例模式一致）。本地请勿删除 `data/`。
- **Dependabot**：`.github/dependabot.yml`——npm 每周更新，minor/patch 合并为一个分组 PR、major 单独 PR；github-actions 每周跟踪。
- **社区文件**：`CONTRIBUTING.md`（中英双语，含三件套命令）、`CODE_OF_CONDUCT.md`、`SECURITY.md`；Issue 模板 `.github/ISSUE_TEMPLATE/`（`bug_report.yml` / `feature_request.yml` / `config.yml`，安全漏洞引导至私密渠道），PR 模板 `.github/PULL_REQUEST_TEMPLATE.md`。新增或修改模板时保持中英双语。

## 搜索范围切换控件（search scope toggle）

搜索模态框的"搜索范围"控件已从**双按钮 tab 组**改为**单按钮点击切换**，以节省移动端横向空间。

- 控件类名：`.search-scope-toggle`（位于 `src/layouts/BaseLayout.astro` 的 `.search-form` 内）。
- 交互逻辑：`src/scripts/search.ts` 中的 `updateScopeToggle()`，点击在 `current`（当前语言）/ `all`（全部语言）之间切换，刷新按钮文案、`data-scope`、`aria-pressed` 并重新触发搜索。
- `aria-pressed="true"` 表示已展开为"全部语言"，`false` 表示"当前语言"。
- CSS：`src/styles/overlays.css` 的 `.search-scope-toggle` 规则。

### i18n 文案（`src/lib/search.ts` 的 `SEARCH_I18N`）

`SearchI18nStrings` 接口新增 `scopeToggleLabel` 字段，用作该单按钮的 `title` / `aria-label`，四语已配置：

| 语言 | `scopeToggleLabel`（按钮无障碍名称/标题） | `scopeCurrent`（按钮文案：当前语言） | `scopeAll`（按钮文案：全部语言） |
|------|------------------------------------------|--------------------------------------|--------------------------------|
| zh | 搜索范围 | 当前语言 | 全部语言 |
| en | Search scope | This language | All languages |
| ja | 検索範囲 | 現在の言語 | すべての言語 |
| fr | Portée de recherche | Langue actuelle | Toutes les langues |

> 注：`scopeCurrent` / `scopeAll` 复用为按钮在两种状态下的可见文案；点击切换时按钮文字在二者间互换。新增任何支持语言时，务必同步补齐 `SEARCH_I18N` 中上述三个字段。

## BGM 播放列表卡片（bgm-switcher / bgm-drawer / bgm-backdrop）

播放列表卡片改为与语言菜单一致的交互模型，并区分桌面/移动端：

- **结构**：src/layouts/BaseLayout.astro 中 .bgm-toggle 按钮被 .bgm-switcher 包裹，.bgm-drawer 卡片与 .bgm-backdrop 遮罩均作为 .bgm-switcher 的子元素（卡片仅当 activePlaylist.showPanel 渲染，遮罩随 activePlaylist 渲染）。
- **桌面端**（@media (hover: hover) and (min-width: 769px)）：鼠标悬浮 .bgm-toggle 即显隐卡片（纯 CSS，同 .lang-switcher:hover .lang-menu），.bgm-switcher::after 桥接间隙防 hover 断开；点按按钮仍为播放/暂停。无遮罩。
- **移动端**（@media (max-width: 768px)）：点按 .bgm-toggle 切换 .bgm-drawer.open（底部抽屉上滑动画 + .bgm-backdrop 淡入遮罩，同搜索）；点遮罩 / Esc 关闭。卡片显隐与遮罩均由 opacity/visibility/transform 过渡完成（开关动画）。
- **JS**：src/scripts/bgm.ts 用 setDrawerOpen(drawer, open) 切换 .open 与 aria-expanded；isMobile() 按 (max-width: 768px) 区分点击行为。原有 openDrawer/closeDrawer/hidden+animationend 方案已移除。
- 卡片内按钮（播放/上一首/下一首）的 hover scale + active 缩放反馈见 `src/styles/overlays.css` 的 .bgm-ctrl-btn。

## OOTB 开箱即用体系（2026-09-04 落地）

总纲文档：`docs/ootb-experience-optimization-2026-09-04.md`；各工作流详细规格见 `docs/specs/15` ~ `19`。

- **交互式初始化向导**：`npm run setup`（`scripts/setup.mjs` 薄 CLI + `scripts/setup-lib.mjs` 纯逻辑）。三模式：快速向导（裁剪语言/模块并写入个人信息）/ 完整示例 / 纯净空白。快速向导支持**场景化预设**（`SCENE_PRESETS`：academic/developer/creator/minimal/custom，仅作模块与语言的默认值，可逐项覆盖）与 **GitHub API 预填**（`fetchGithubProfile`，5s 超时静默降级，仅交互模式触发，非交互路径零触网）。非交互环境（`!isTTY`、`CI=true`、`--example|--blank|--yes`）自动回退完整示例复制；`data/` 已存在无条件跳过。注意：site.yaml 的 `github.username` 为必填，关闭 GitHub 模块时保留最小 `github:` 段而非删除。
- **健康自检**：`npm run doctor`（`scripts/doctor.ts` + `scripts/doctor-lib.ts`）。默认离线，`--online` 才查 GitHub API / RSS；退出码 1 = 有致命错误（可接 CI）。
- **多平台部署**：根目录 `Dockerfile`（多阶段 node:24-slim → nginx:alpine，nginx 配置在 `deploy/nginx.conf`）、`docker-compose.yml`、`vercel.json`、`netlify.toml`、`.devcontainer/devcontainer.json`。隐私约束：`data/` 经 `.dockerignore` 排除，私有数据仅可通过 `DATA_SOURCE_URL` 构建参数注入。
- **后台数据导入**（spec 18，`admin/server/import.ts`）：BibTeX 导入（侧栏「配置 → 学术成果」，预览→去重→合并 publications.yaml，DOI/标题去重）与 data.zip 导入（顶栏「📥 导入 data.zip」，路径穿越整包拒绝，覆盖前自动备份至 `data/.snapshots/import-backup/`）。
- **新手欢迎向导**（spec 19）：`ensureDataDir()` 返回 `initialized=true` 且无 `data/.onboarding-done` 标记时后台自动弹三步卡片（名片/模块编排/主题色盘）；顶栏「🚀 新手向导」可随时重开；完成或任意跳过均写标记。第 1 步支持「⚡ 自动同步信息」：`GET /api/github/prefill?username=`（`admin/server/github-prefill.ts`，5s 超时，404/502 友好降级），仅填充空字段、不覆盖用户已输入内容。
- **语言管理面板**（spec 19 §4，`admin/server/languages.ts` + 侧栏「配置 → 语言管理」）：勾选式启停语言，停用 = `data/pages/<lang>/` 与 `data/streaming/<lang>/` 整目录归档至 `data/.archived_langs/`（可无损恢复，LocalizedText 键保留）。防护：默认语言（`site.language` 归一化后）锁定 400；停用 en 或剩余 <2 语言需 `confirm: true` 二次确认（响应带 `en-fallback`/`i18n-off` 机读警告）；归档/恢复目标冲突一律 409 不覆盖；操作前逐文件快照。扫描点结论：doctor/搜索/src 侧只扫活跃 `pages/` 天然排除归档，`data.zip` 导出包含归档目录（有测试守护）。

## 后台图形化工具入口（spec 20）

- **顶栏「🔄 刷新动态数据」**：`POST /api/prefetch` 调 `runPrefetch()`（固定 force，60s 总超时兜底）写 `.cache/`；进程内并发守卫重复触发 409；`GET /api/prefetch/status` 从 `.cache/meta.json` 的 `updated_at`（回退缓存文件 mtime）给出上次抓取时间，展示在按钮 title。解决"改完 GitHub 用户名 / rss.yaml 忘记 prefetch 导致区块空态"的痛点。
- **侧栏「工具 → 健康检查」**（`#/doctor`，`admin/ui/views/doctor.ts`）：`GET /api/doctor`（默认离线，`?online=1` 追加 GitHub API / RSS 探测）调 `runDoctor()`，报告按级别分色渲染、建议折叠展开，可一键重跑。
- **自动打开浏览器**：`npm run admin` 启动后 `openBrowser()`（`admin/server/open-browser.ts`）零依赖开浏览器——Windows `cmd /c start "" <url>` / macOS `open` / Linux `xdg-open`；`ADMIN_NO_OPEN=1` 禁用，失败静默降级（URL 照常打印）。平台命令构造抽成纯函数 `buildOpenCommand` 供单测。
- 服务端注入点：`AdminServerOptions` 的 `cacheDir` / `prefetchRun` / `doctorRun`（`admin/server/live-tools.ts`），测试全部替身零触网（`tests/admin-live-tools.test.ts`）。

## Admin 发布闭环（2026-09-05 落地，spec 21）

详细规格见 `docs/specs/21-admin-publish.md`。

- **侧栏「发布」视图**（`#/publish`，`admin/ui/views/publish.ts`）：一键构建（`admin/server/build.ts`，分 5 阶段 spawn：fonts → og → astro build → css → images，node 直跑 tsx/astro CLI 避开 .cmd 壳；状态机 idle→running→success|failed，进行中重复启动 409；`stop()` 走 devserver 的 killProcessTree 树杀回 idle）；构建成功后「预览 dist」（`admin/server/preview.ts`，**进程内**复用 scripts/serve.ts 的 createStaticServer，127.0.0.1:4399，幂等/外部占用接管/退出时 close）；OG 分享卡预览（`admin/server/og-preview.ts`，进程内调 generateOgSvg 返回 SVG，不写盘不依赖 sharp，自定义 og_image 页面回传 custom 路径）。
- **学术成果逐条编辑**（`admin/server/publications.ts` + 「学术成果」视图上半区）：列表 + 弹窗表单增删改，整文件 `GET/PUT /api/config/publications`，服务端逐条校验（必填约束对齐 src/lib/publications.ts normalizeItem + id 唯一 + type 枚举）+ createSnapshot 快照链路；未知字段（如 doi）编辑往返不丢；BibTeX 导入面板保留在下方。
- 测试：`tests/admin-publish.test.ts`（假 spawn/probe runner，不真跑构建）、`tests/admin-publications.test.ts`（快照断言模式同 admin-configs）。

## 部署引导与新手向导统一（spec 22，2026-09-05 落地）

详细规格：`docs/specs/22-admin-deploy-guide.md`。

- **「🚀 部署到线上」引导**：顶栏导出按钮旁（`admin/ui/views/deploy.ts`），四步清单卡片：导出 data.zip → 托管拿直链（私有 Release / Secret Gist / 对象存储，强调隐私）→ 配 Secrets（`DATA_SOURCE_URL`/`GH_PAT`/`ENABLE_EXAMPLE` 逐项说明 + deep link）→ 触发 Actions。仓库地址由 `GET /api/deploy-info`（`admin/server/deploy-info.ts`，读 git remote origin，5s 超时）探测；读不到则全 null 降级为前端手填拼链接，解析逻辑统一在 `admin/shared/deploy.ts`。
- **新手向导第 0 步「场景预设」**：向导扩为四步（场景 → 名片 → 模块 → 主题色）。预设单一数据源抽到 `scripts/scene-presets.mjs`（+ `.d.mts` 类型声明），CLI setup 与 admin 共享防漂移，`setup-lib.mjs` 仅 re-export 行为不变。选定场景经 `admin/shared/scene-presets.ts` 的 `sceneDefaults()` 映射为第 2 步模块勾选默认值（github/rss + BGM/联系卡；publications 不参与、语言不裁剪），`custom`/未知 key 不动现状。完成页（第 3 步）给「前往语言管理」链接。
- **doctor GH_PAT 引导**：`scripts/doctor-lib.ts` 在限流（403+额度 0）/401 的建议与 `--online` 新增的 token 环境变量检查（`checkGithubTokenEnv`，`GH_PAT`/`GITHUB_TOKEN`/`GH_TOKEN` 任一即 ok）中统一附生成页链接 https://github.com/settings/tokens 与 `read:user` scope 说明；两个 README 的 Secrets 小节同步补引导。

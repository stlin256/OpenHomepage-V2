# AGENTS.md

本文件记录供 AI 协作代理参考的约定与说明。

## 版本号维护机制（Version Maintenance Policy）

- **当前版本号**：`0.2.0`（Git tag: `v0.2.0`，`package.json` 中的 `version: "0.2.0"`，About 页面胶囊标识 `v0.2.0`）。
- **更新原则与请示机制**：
  - **更新版本号必须主动请示用户**，获得明确确认后方可递增版本或打新 tag。
  - **默认不自动更新版本号**：即使进行了常规功能迭代、样式修复、性能优化或文档更新，也保持当前版本号不变，除非用户明确要求发版或升级版本。
  - 经用户指示升级版本时，需同步更新 `package.json` 的 `version` 字段、各语言 `about.md` 中的胶囊 Tag 文案，并打对应 Git tag（例如 `git tag -a v0.2.0 -m "Release v0.2.0"`）提交推送。

## 搜索范围切换控件（search scope toggle）

搜索模态框的"搜索范围"控件已从**双按钮 tab 组**改为**单按钮点击切换**，以节省移动端横向空间。

- 控件类名：`.search-scope-toggle`（位于 `src/layouts/BaseLayout.astro` 的 `.search-form` 内）。
- 交互逻辑：`src/scripts/search.ts` 中的 `updateScopeToggle()`，点击在 `current`（当前语言）/ `all`（全部语言）之间切换，刷新按钮文案、`data-scope`、`aria-pressed` 并重新触发搜索。
- `aria-pressed="true"` 表示已展开为"全部语言"，`false` 表示"当前语言"。
- CSS：`src/styles/global.css` 的 `.search-scope-toggle` 规则。

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
- 卡片内按钮（播放/上一首/下一首）的 hover scale + active 缩放反馈见 .bgm-ctrl-btn。

## OOTB 开箱即用体系（2026-09-04 落地）

总纲文档：`docs/ootb-experience-optimization-2026-09-04.md`；各工作流详细规格见 `docs/specs/15` ~ `19`。

- **交互式初始化向导**：`npm run setup`（`scripts/setup.mjs` 薄 CLI + `scripts/setup-lib.mjs` 纯逻辑）。三模式：快速向导（裁剪语言/模块并写入个人信息）/ 完整示例 / 纯净空白。快速向导支持**场景化预设**（`SCENE_PRESETS`：academic/developer/creator/minimal/custom，仅作模块与语言的默认值，可逐项覆盖）与 **GitHub API 预填**（`fetchGithubProfile`，5s 超时静默降级，仅交互模式触发，非交互路径零触网）。非交互环境（`!isTTY`、`CI=true`、`--example|--blank|--yes`）自动回退完整示例复制；`data/` 已存在无条件跳过。注意：site.yaml 的 `github.username` 为必填，关闭 GitHub 模块时保留最小 `github:` 段而非删除。
- **健康自检**：`npm run doctor`（`scripts/doctor.ts` + `scripts/doctor-lib.ts`）。默认离线，`--online` 才查 GitHub API / RSS；退出码 1 = 有致命错误（可接 CI）。
- **多平台部署**：根目录 `Dockerfile`（多阶段 node:24-slim → nginx:alpine，nginx 配置在 `deploy/nginx.conf`）、`docker-compose.yml`、`vercel.json`、`netlify.toml`、`.devcontainer/devcontainer.json`。隐私约束：`data/` 经 `.dockerignore` 排除，私有数据仅可通过 `DATA_SOURCE_URL` 构建参数注入。
- **后台数据导入**（spec 18，`admin/server/import.ts`）：BibTeX 导入（侧栏「配置 → 学术成果」，预览→去重→合并 publications.yaml，DOI/标题去重）与 data.zip 导入（顶栏「📥 导入 data.zip」，路径穿越整包拒绝，覆盖前自动备份至 `data/.snapshots/import-backup/`）。
- **新手欢迎向导**（spec 19）：`ensureDataDir()` 返回 `initialized=true` 且无 `data/.onboarding-done` 标记时后台自动弹三步卡片（名片/模块编排/主题色盘）；顶栏「🚀 新手向导」可随时重开；完成或任意跳过均写标记。第 1 步支持「⚡ 自动同步信息」：`GET /api/github/prefill?username=`（`admin/server/github-prefill.ts`，5s 超时，404/502 友好降级），仅填充空字段、不覆盖用户已输入内容。
- **语言管理面板**（spec 19 §4，`admin/server/languages.ts` + 侧栏「配置 → 语言管理」）：勾选式启停语言，停用 = `data/pages/<lang>/` 与 `data/streaming/<lang>/` 整目录归档至 `data/.archived_langs/`（可无损恢复，LocalizedText 键保留）。防护：默认语言（`site.language` 归一化后）锁定 400；停用 en 或剩余 <2 语言需 `confirm: true` 二次确认（响应带 `en-fallback`/`i18n-off` 机读警告）；归档/恢复目标冲突一律 409 不覆盖；操作前逐文件快照。扫描点结论：doctor/搜索/src 侧只扫活跃 `pages/` 天然排除归档，`data.zip` 导出包含归档目录（有测试守护）。
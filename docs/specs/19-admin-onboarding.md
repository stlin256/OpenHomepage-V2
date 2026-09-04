# 19：Admin 新手欢迎向导 + 语言管理面板（规格）

> 状态：上半（欢迎向导）与下半（语言管理面板）均已实现。
> 来源：OOTB 总纲 `docs/ootb-experience-optimization-2026-09-04.md`「支柱二」（痛点 #3 全量示例覆盖无向导、#4 四语认知负荷高）。
> 全局约束：零新增 npm 依赖；配置写盘只走既有 `PUT /api/config/site`（schema 校验 + 快照 + 撤销链），不新造配置体系；标记文件等轻量状态不走快照（`admin/server/paths.ts` 的 `assertSnapshottable` 仅放行 pages/**、streaming/** 与根下 *.yaml/*.bib）。

## 1. 用户目标

- 新用户 `npm run admin` 首次启动（`data/` 由 `data.example/` 自动初始化）时，进入后台即弹出三步欢迎向导，一分钟内把示例站变成"自己的站"：个人名片 → 首页模块 → 主题色。
- 向导不强推：每步可跳过、整体可跳过；完成后不再打扰，但顶栏「🚀 新手向导」可随时重开。

## 2. 触发与完成标记

### 2.1 触发条件（后端判定）

- `admin/server/setup.ts` 的 `ensureDataDir()` 返回 `{ initialized }`：true 表示本次启动刚用示例数据初始化 `data/`（天然"首次启动"信号，经 `admin/server/index.ts` → `createAdminServer({ initialized })` 传入）。
- 完成标记：`data/.onboarding-done`（内容为 ISO 时间戳的纯文本标记文件，直接 `writeFileSync`，不走快照——见全局约束）。
- 自动弹出条件（`admin/server/onboarding.ts` `shouldShowOnboarding`）：`initialized === true` **且**标记文件不存在。两者相与：老用户（data/ 非本次初始化）永不弹；首次初始化但已完成/跳过向导的也不再弹。

### 2.2 前端行为

- 进入后台 boot 完成后 `GET /api/onboarding`（实时查标记文件，写盘后无需重启即生效），`show: true` 时自动弹出向导；探测失败静默忽略，不阻塞后台。
- 顶栏固定「🚀 新手向导」按钮（`admin/ui/main.ts`），随时手动重开（不看触发条件）。
- **完成或任何跳过/关闭路径（逐步跳过、跳过向导、点遮罩、Esc）都会写标记文件**，保证"不再自动弹出"语义唯一出口。

### 2.3 HTTP 端点

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| GET | `/api/onboarding` | — | `{ show: boolean }` |
| POST | `/api/onboarding/done` | — | `{ ok: true }`（写 `data/.onboarding-done`，幂等覆盖） |
| GET | `/api/github/prefill?username=<name>` | — | `{ name, bio, blog, avatarUrl, htmlUrl }`（GitHub 公开资料预填，见 §3.1；上游 null 归一为空串） |

## 3. 三步卡片（`admin/ui/views/onboarding.ts`）

复用后台现有 `.modal-overlay` / `.modal` / `.swatches` 等样式（新增 `.onboarding-*` 补充类，窄屏 `width: min(560px, 100vw - 32px)` 移动端可用）。头部为标题 + 简介 + 步骤进度（`第 n / 3 步 · 步骤名`）；底部操作条：「跳过向导」居左，「上一步 / 跳过本步 / 保存并继续（或完成）」居右。

配置改写纯逻辑集中在 `admin/shared/onboarding.ts`（无 DOM/Node 依赖，前端视图与单测共用）；保存统一 `api.saveSite()` → `PUT /api/config/site`（schema 校验 + 自动快照 + 撤销链）。每步离开时有改动才保存（`dirty` 标记），保存失败就地报错留在当前步。

### 第 1 步 个人名片

- 字段：姓名（zh/en 双输入）、Tagline（zh/en 双输入）、GitHub 用户名。
- `applyOnboardingProfile`：`profile.name` / `profile.tagline` 沿用 `localizedField` 语义写多语言对象（**保留 ja/fr 等其他语言键**，双空视为未填写不动原值）；`github.username` 去空白后非空才写。

### 3.1 GitHub 公开资料预填（「⚡ 自动同步信息」按钮）

- **交互**：第 1 步 GitHub 用户名输入框旁固定「⚡ 自动同步信息」按钮。点击以当前输入的用户名调 `GET /api/github/prefill`，成功后按填充策略（见下）就地填入表单并置 `dirty`（随后「保存并继续」统一走 `PUT /api/config/site` 落盘）；按钮请求期间进入 loading 态（禁用 + 文案切换）防重复点击。失败在卡片内就地显示错误提示（复用 `.form-error`），**不关闭、不阻断向导**，用户名等已填内容保持原样。
- **端点契约**（`admin/server/github-prefill.ts`，零新增依赖，全局 fetch）：
  - 请求 `https://api.github.com/users/<username>`，带 `User-Agent` 头（GitHub API 必需）与 `AbortController` **5 秒超时**；
  - `username` 参数先经 `GITHUB_USERNAME_RE`（字母数字/连字符，1–39 位，不得以连字符开头）校验，非法 → **400**；
  - 上游 404（用户不存在）→ **404** + 友好错误；网络失败 / 超时 / 其他非 2xx（如匿名限流 403）→ **502** + 友好错误（`GithubPrefillError.status` 经 `sendError` 映射）；
  - 成功 → 200 `{ name, bio, blog, avatarUrl, htmlUrl }`（上游 null 字段归一为空串）。`avatarUrl`/`htmlUrl` 目前仅透传，前端暂不消费。
- **超时降级语义**：5 秒内拿不到响应即按 502 处理并向用户提示「网络失败或超时，请稍后重试」；向导不因此中断，用户可改用户名重试或直接手动填写。离线环境（无 GitHub 可达性）下该按钮等同 502 降级路径。
- **填充策略**（纯函数 `githubPrefillSuggestions`，可单测）：GitHub `name`/`bio` 无语言维度，对 zh/en 两侧按同一规则各自判定——**仅填充「当前为空」或「用户尚未手改过」的字段，用户已输入的内容一律不覆盖**（视图以 `touched` 标记跟踪手改状态）。
- **博客链接**：`applyGithubBlogLink(cfg, blog)` 把 GitHub `blog` 主页链接并入 `profile.links` 社交链接（裸域名补 `https://`；忽略大小写与末尾斜杠去重，已存在则不动；blog 为空不动配置），返回是否改动。

### 第 2 步 模块编排

- 首页模块勾选 = `site.yaml` `home.layout` 的条目增删，不新造配置：
  - `listModuleCandidates` 产出固定区块（profile / markdown / github / rss）+ `streaming_blocks` / `editorial_blocks` 中已定义的区块（key 形如 `streaming:welcome`、`editorial:work`），顺序即规范落位序（profile → streaming/editorial → markdown → github → rss）；
  - `applyModuleSelection(cfg, enabledKeys)`：未勾选的条目移除、新勾选的按规范序落位重建 `home.layout`；引用已不存在定义的 key 忽略；原 layout 中的未知自定义条目若仍勾选则保留（排最后）；**勾选结果为空时不改动**（防误清空首页）。
- 附加「其他功能」开关：背景音乐（`bgm.enabled`）、右下联系卡（`contact.intro_card.enabled`），均为既有宽松校验字段，启用但缺素材时渲染端自然降级（`resolveBgm` / `resolveIntroCard` 返回 null）。
- 布局顺序的精细调整仍属「配置 → 流式块」拖拽排序器，向导只做勾选。

### 第 3 步 主题色盘

- 内置 6 个预设强调色（`ACCENT_PRESETS`，首色即默认 `#3a7bd5`）一键应用；当前 accent 命中预设时预选高亮。
- 点选即写入 `cfg.theme.accent`（`applyAccent`，复用取色器的 `normalizeHex`）并热更新编辑器内 `--accent` 预览（同「配置 → 主题」取色器）；「完成」保存后关闭。
- 未完成而关闭（跳过/遮罩/Esc）时还原打开前的 `--accent`，避免编辑器残留未落盘的预览色。

### 3.4 i18n 文案

全部进 `admin/shared/i18n.ts`（zh/en 键集合一致，`tests/admin-i18n.test.ts` 守护）；姓名/Tagline/GitHub 用户名等字段标签复用既有 `profileNameZh` 等键，仅新增向导自身与模块名文案（`onboarding*`、`mod*`）。

## 4. 语言管理面板（已实现）

> 目标：把四语示例数据的认知负荷降为可勾选——后台勾选启停语言，停用语言整体归档至 `data/.archived_langs/`，可随时恢复。入口在侧栏「配置 → 语言管理」（`#/config/languages`）。

### 4.1 交互与数据模型（实现形态）

- 面板（`admin/ui/views/languages.ts`）分「当前启用的语言 / 已归档（已停用）」两组列出语言目录，每项显示页面数统计；默认语言行带锁定徽标、停用按钮置灰。
- 「停用」= 将 `data/pages/<lang>/` 整目录移动到 `data/.archived_langs/pages/<lang>/`，并同步归档 `data/streaming/<lang>/`（流式内容按语言分目录，见 `src/lib/stream.ts` 的 `resolveStreamingFile`）至 `data/.archived_langs/streaming/<lang>/`；「恢复」为反向移动。移动前对涉及文件逐个 `createSnapshot`（pages/**、streaming/** 均在 `assertSnapshottable` 白名单内）。
- `site.yaml` 内 LocalizedText 对象中的停用语言键**保留不删**（纯字符串字段无语言维度；保留键使恢复无损，且渲染端对多余键容忍）。
- 归档目标已存在（残留旧归档）→ 409 拒绝覆盖；恢复目标已存在 → 409 拒绝；归档不存在的语言 / 恢复不存在的归档 → 400。

### 4.2 HTTP 端点契约

| 方法 | 路径 | 请求体 | 响应 |
|------|------|--------|------|
| GET | `/api/languages` | — | `{ languages: [{lang, pages}], archived: [{lang, pages}], defaultLang: string\|null, hasEn: boolean, total: number }` |
| POST | `/api/languages/archive` | `{ lang: string, confirm?: boolean }` | 200 `{ ok: true, lang, warnings: string[] }`；warnings 为机读标记：`en-fallback`（归档的是 en）/ `i18n-off`（归档后剩余 <2 语言） |
| POST | `/api/languages/restore` | `{ lang: string }` | 200 `{ ok: true, lang, warnings }`（en 恢复同样带 `en-fallback`） |

错误码：非法语言码 / 语言目录不存在 / 归档不存在 → 400；停用默认语言 → 400；归档后剩余 <2 语言且未带 `confirm: true` → 409（`LangConflictError`，提示语说明 i18n 关闭后果）；归档/恢复目标已存在 → 409。

### 4.3 风险处置结论（对应原五条风险）

1. **路由与默认语言**：`langs` 来自 `detectLanguages(pages)` 即目录扫描——停用语言移出 `pages/` 后自动从 `langs` 消失，路由、导航、`alternateLinks` 自然收缩，构建代码零改动。`site.language` 指向被停用语言时 `defaultLang` 回退 `langs[0]`，URL 前缀规则整体漂移——**已按推荐方案实现为默认语言锁定**：`site.language` 归一化（`normalizeLang`）得到的语言停用返回 400，前端置灰并标注；`site.yaml` 读不出时 `defaultLang` 为 null，不做锁定。
2. **回退链断裂**：en 是 `resolvePageForLang` 回退链固定一环。**不禁止停用 en**，但响应携带 `warnings: ['en-fallback']`，前端确认对话框展示风险文案。
3. **i18n 开关阈值**：归档后剩余 <2 语言时整站 i18n 关闭、带前缀外链 404——**二次确认已实现**：无 `confirm: true` 返回 409，前端弹确认框展示风险文案后带 `confirm: true` 重发。
4. **构建面影响（扫描点排查结论）**：归档目录为 `data/.archived_langs/`（点目录），逐一核实结果——
   - `src/lib/config.ts loadPages` / `admin/server/pages.ts listPages` / `src/lib/search-index.ts`：只扫 `data/pages/` 一层语言目录，归档目录在其之外，**天然排除**；
   - `scripts/doctor-lib.ts`：`listLangDirs` 只扫 `data/pages/`；素材引用与指令配平检查只扫 `data/pages/`、`data/streaming/` 与根下 yaml，**天然排除**（有测试守护：归档后 doctor 只见活跃语言）；
   - `admin/server/export.ts collectDataEntries`：data/ 全量递归，**包含** `.archived_langs/`（与风险⑤结论一致，有测试守护）；
   - 无需任何排除性代码修正。
5. **非破坏原则**：归档目录不入 git（data/ 整体 gitignore）；导出 data.zip **包含** `.archived_langs/`，整包迁移后可恢复；归档/恢复前逐文件留快照（`.snapshots/pages/<lang>/…`、`.snapshots/streaming/<lang>/…`），恢复方向因目标必不存在（否则 409）无可快照对象，且操作本身可逆（可再次归档）。

## 5. 测试（`tests/admin-onboarding.test.ts`、`tests/admin-languages.test.ts`）

- 触发逻辑：`shouldShowOnboarding` 的 initialized × 标记文件矩阵；
- 标记读写：`markOnboardingDone` 生成 `data/.onboarding-done`、幂等覆盖；
- HTTP 端点：`GET /api/onboarding` 在标记前后从 true 翻转为 false；`initialized: false` 恒 false；`POST /api/onboarding/done` 落标记；
- 纯逻辑（`admin/shared/onboarding.ts`）：
  - `applyOnboardingProfile`：双语写入、保留 ja/fr 键、空值不动、GitHub 用户名去空白；
  - `listModuleCandidates` / `enabledModuleKeys` / `applyModuleSelection`：候选顺序、勾选移除/按规范序回补、无效 id 忽略、空勾选不改、未知条目保留；
  - `applyFeatureToggles`：bgm/contact 开关落键；
  - `applyAccent`：hex 规范化（#rgb→#rrggbb 小写）与非法值拒绝。
- GitHub 预填（§3.1）：注入 fetch 替身经 `AdminServerOptions.githubFetch` / `githubTimeoutMs` 透传，覆盖端点三路径——成功（200 + 字段映射 + User-Agent/URL 断言）、上游 404（→ 404）、网络失败与超时（→ 502）；非法用户名 400。纯逻辑 `githubPrefillSuggestions`（空字段/未手改才填、已手改不覆盖、空输入不出建议）与 `applyGithubBlogLink`（补 scheme、去重、空值不动）。
- 语言管理面板（§4，`tests/admin-languages.test.ts`）：归档/恢复往返（pages 与 streaming 子树）、默认语言锁定（400）、en 警告标记（`en-fallback`）、<2 语言无 confirm 409 / 带 confirm 通过（`i18n-off`）、归档/恢复目标已存在 409、归档不存在 400、LocalizedText 键逐字节保留、快照产生、导出 zip 包含 `.archived_langs/`、doctor 语言扫描只见活跃 pages/。
- 回归：`tests/admin-i18n.test.ts`（字典键同步）、`admin-configs` / `admin-api` / `admin-color` 等相邻测试；前端用 esbuild 内存打包验证编译。

## 6. 已知限制

- 向导第 2 步只做勾选启停，不支持排序（排序仍用「配置 → 流式块」拖拽）；模块勾选不影响正文里手写的 `::stream` / `::editorial` 指令。
- GitHub 预填（§3.1）依赖外网可达性：离线/超时按 502 就地提示降级，不打断向导；匿名调用受 GitHub API 限流（60 次/小时/IP）约束，超限同样落 502 提示稍后重试。预填只消费 `name`/`bio`/`blog`，`avatarUrl`/`htmlUrl` 仅透传暂不使用。
- 完成标记随 data/ 目录走：删除 `data/` 重新初始化后视为全新首次启动，向导会再次自动弹出（符合直觉）。
- 语言管理面板（§4）已实现；已知限制：归档/恢复目标冲突（残留旧归档、恢复目标已存在）一律 409 拒绝覆盖，需用户手动处理；面板只做目录级启停，不提供语言内页面的批量翻译/删除。

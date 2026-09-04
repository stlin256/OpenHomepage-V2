# 19：Admin 新手欢迎向导 + 语言管理面板（规格）

> 状态：上半（欢迎向导）已实现；下半（语言管理面板）仅规格，本期不实现。
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

## 3. 三步卡片（`admin/ui/views/onboarding.ts`）

复用后台现有 `.modal-overlay` / `.modal` / `.swatches` 等样式（新增 `.onboarding-*` 补充类，窄屏 `width: min(560px, 100vw - 32px)` 移动端可用）。头部为标题 + 简介 + 步骤进度（`第 n / 3 步 · 步骤名`）；底部操作条：「跳过向导」居左，「上一步 / 跳过本步 / 保存并继续（或完成）」居右。

配置改写纯逻辑集中在 `admin/shared/onboarding.ts`（无 DOM/Node 依赖，前端视图与单测共用）；保存统一 `api.saveSite()` → `PUT /api/config/site`（schema 校验 + 自动快照 + 撤销链）。每步离开时有改动才保存（`dirty` 标记），保存失败就地报错留在当前步。

### 第 1 步 个人名片

- 字段：姓名（zh/en 双输入）、Tagline（zh/en 双输入）、GitHub 用户名。
- `applyOnboardingProfile`：`profile.name` / `profile.tagline` 沿用 `localizedField` 语义写多语言对象（**保留 ja/fr 等其他语言键**，双空视为未填写不动原值）；`github.username` 去空白后非空才写。

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

## 4. 语言管理面板（仅规格，本期不实现）

> 目标：把四语示例数据的认知负荷降为可勾选——在后台勾选启停语言，停用语言整体归档至 `data/.archived_langs/`，可随时恢复。入口建议放侧栏「多语言同步」看板顶部（与缺译/回退视图同语境）。

### 4.1 交互与数据模型

- 面板列出 `data/pages/` 下现有语言目录（如 zh/en/ja/fr），每项一个启用勾选 + 页面数统计；`site.language` 归一化（`normalizeLang`）得到的默认语言**不可停用**（置灰并标注）。
- 「停用」= 将 `data/pages/<lang>/` 整目录移动到 `data/.archived_langs/pages/<lang>/`，并同步处理该语言专属内容：`data/streaming/` 中按语言命名的流式内容文件（如有 `<id>.<lang>.md` 约定）一并归档；`site.yaml` 内 LocalizedText 对象中的该语言键**保留不删**（纯字符串字段无语言维度；保留键使恢复无损，且渲染端对多余键容忍）。
- 「恢复」= 反向移动回原位。
- 归档/恢复前对涉及文件留快照（pages/** 与 streaming/** 均在 `assertSnapshottable` 白名单内；目录级操作需逐文件快照或整体打包进 `.snapshots/import-backup/` 式 zip）。

### 4.2 风险与设计要点

1. **路由与默认语言**（`src/lib/routes.ts`、`src/pages/[...slug].astro`）：`langs` 来自 `detectLanguages(pages)` 即目录扫描——停用语言移出 `pages/` 后自动从 `langs` 消失，路由、导航、`alternateLinks`（hreflang/语言切换器）自然收缩，无需改构建代码。但 `site.language` 指向被停用语言时 `defaultLang` 回退为 `langs[0]`，URL 前缀规则整体漂移（原无前缀语言变成带前缀）——因此面板必须禁止停用默认语言，或停用时联动改写 `site.language`（推荐前者，简单可预期）。
2. **回退链断裂**：`resolvePageForLang` 的回退链为「当前语言 → en → 默认语言 → 任一可用版本」。停用 en 会显著改变其他语言的回退行为（en 是链上固定一环）；面板应对此给出警告文案，但不禁止。
3. **i18n 开关阈值**：`isI18nEnabled(langs)` 要求 ≥2 种语言。停用至只剩 1 种时整站 i18n 关闭（语言切换器、`/lang/` 前缀路由全部消失），站内既有带前缀外链/书签 404——面板在勾选结果 <2 时应二次确认。
4. **构建面影响**：搜索索引、feed（`[lang]/feed.*.xml.ts`）、OG 图、流式块语言回退均按 `langs` 派生，随目录扫描自动一致；主要风险是 `.archived_langs/` 不能被 `loadPages`/素材/导出等扫描误拾——归档目录以 `.` 开头，需逐一核实各扫描点（`collectDataEntries` 导出、doctor 素材检查、搜索构建）对点目录的排除策略，必要时显式跳过。
5. **非破坏原则**：归档目录不入 git（data/ 整体 gitignore），导出 data.zip 时应**包含** `.archived_langs/` 以便整包迁移后可恢复。

## 5. 测试（`tests/admin-onboarding.test.ts`）

- 触发逻辑：`shouldShowOnboarding` 的 initialized × 标记文件矩阵；
- 标记读写：`markOnboardingDone` 生成 `data/.onboarding-done`、幂等覆盖；
- HTTP 端点：`GET /api/onboarding` 在标记前后从 true 翻转为 false；`initialized: false` 恒 false；`POST /api/onboarding/done` 落标记；
- 纯逻辑（`admin/shared/onboarding.ts`）：
  - `applyOnboardingProfile`：双语写入、保留 ja/fr 键、空值不动、GitHub 用户名去空白；
  - `listModuleCandidates` / `enabledModuleKeys` / `applyModuleSelection`：候选顺序、勾选移除/按规范序回补、无效 id 忽略、空勾选不改、未知条目保留；
  - `applyFeatureToggles`：bgm/contact 开关落键；
  - `applyAccent`：hex 规范化（#rgb→#rrggbb 小写）与非法值拒绝。
- 回归：`tests/admin-i18n.test.ts`（字典键同步）、`admin-configs` / `admin-api` / `admin-color` 等相邻测试；前端用 esbuild 内存打包验证编译。

## 6. 已知限制

- 向导第 2 步只做勾选启停，不支持排序（排序仍用「配置 → 流式块」拖拽）；模块勾选不影响正文里手写的 `::stream` / `::editorial` 指令。
- 向导不拉取 GitHub API 预填（总纲提及的"自动同步"属 CLI 向导 spec 15 的能力，后台向导保持离线零依赖）。
- 完成标记随 data/ 目录走：删除 `data/` 重新初始化后视为全新首次启动，向导会再次自动弹出（符合直觉）。
- 语言管理面板（§4）本期仅为规格，未实现；其风险清单（默认语言锁定、en 回退环、<2 语言确认、点目录扫描排除）是实施前的必读约束。

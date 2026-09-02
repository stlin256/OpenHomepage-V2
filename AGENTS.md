# AGENTS.md

本文件记录供 AI 协作代理参考的约定与说明。

## 版本号维护机制（Version Maintenance Policy）

- **当前版本号**：`0.1.0`（Git tag: `v0.1.0`，`package.json` 中的 `version: "0.1.0"`，About 页面胶囊标识 `v0.1.0`）。
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
# AGENTS.md

本文件记录供 AI 协作代理参考的约定与说明。

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

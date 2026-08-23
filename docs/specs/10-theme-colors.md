# 主题色变量体系（细化项 #10）

> 状态：✅ 已确认（2026-08-22）。明暗双主题；accent 由 site.yaml `theme.accent` 指定（编辑器取色器写回）。

## 1. 语义色变量

CSS 自定义属性，按明暗主题各一套：

| 变量 | 浅色默认 | 深色默认 | 用途 |
|------|---------|---------|------|
| `--bg` | `#ffffff` | `#121417` | 页面底色 |
| `--bg-subtle` | `#f6f7f8` | `#1a1d21` | 卡片/代码块底色 |
| `--text` | `#1a1d21` | `#e8eaed` | 正文 |
| `--text-muted` | `#5f6670` | `#9aa1a9` | 次要文字 |
| `--border` | `#e3e6ea` | `#2a2f36` | 分割线/卡片描边 |
| `--accent` | 配置值 | 配置值 | 链接、强调、光标、hover 描边 |
| `--accent-contrast` | 自动计算 | 自动计算 | accent 底色上的文字色（黑/白，按对比度自动选） |

中性色固定（精心设计的一套），用户只配 `--accent`。

## 2. accent 的应用约束

- 深色模式下对 accent 做明度校正：若配置的 accent 在深色底上对比度 < 4.5:1，自动提亮（构建时计算，输出两个值）。实现（`src/lib/theme.ts` `correctAccentForDark`）：按 12% 向白色逐档提亮直至 ≥ 4.5:1（最多 20 档保底），而非只提一档——单档无法保证达标。
- 杂志排版原则：accent 克制使用——链接、小细节、hover 态；不大面积铺色。

## 3. 主题切换

- `<html data-theme>` 属性切换；**只有亮/暗两态**（无"跟随系统"第三态）。
- 页面打开时：sessionStorage 中的用户选择 > site.yaml `theme.default_mode`（light/dark 时）> 跟随系统 `prefers-color-scheme`；首帧前由 `<head>` 内联脚本完成解析，防闪烁。
- 用户点击导航区角落的小图标按钮（太阳/月亮，按当前主题显示，hover 才显轮廓）切换后，选择写入 **sessionStorage**：本次会话内（含 ClientRouter 站内转场）保持；离开站点/关闭标签页后重置，重新跟随系统。系统主题变化只在用户未手动选择时跟随。
- ClientRouter 转场会把 `<html>` 属性还原为 SSR 值且内联脚本不重放：常驻模块脚本（`src/scripts/theme.ts`）在 `astro:before-swap` 把旧 `<html>` 的 `data-theme`、内联 accent style 与 `.js` 标记复制进新文档（`src/lib/theme.ts` `carryThemeAttrs`，纯函数有单测），保证 swap 完成瞬间主题已正确；`astro:after-swap` 重放保留作兜底。
- 切换时仅颜色变量 200ms 过渡，不动布局。

## 4. 编辑器取色器回写

- 编辑器"主题"页：展示头像自动提取的 4–6 个候选色（构建/编辑时由脚本提取）+ 头像点取 + 手动输入 hex。
- 选定后写回 `site.yaml theme.accent`，并实时预览（编辑器内 CSS 变量热更新）。

# OpenHomepage V2

个人主页静态站点：Astro (SSG) + 杂志化排版 + 明暗双主题 + 多语言。设计依据见 `docs/design.md` 与 `docs/specs/`。

## 快速开始

```bash
npm install
npm run dev        # 无需 setup：本地无 data/ 时自动回退 data.example/ 示例数据并打印 warning
```

真实内容放在 `data/`（不入库）。从示例初始化自己的数据：

```bash
npm run setup      # 从 data.example/ 复制生成 data/（已存在则跳过）
```

## 常用脚本

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发服务器 |
| `npm run build` | 构建到 `dist/`（含 data/assets 拷贝） |
| `npm test` | vitest 单元测试 |
| `npm run prefetch` | 预取 GitHub / RSS 数据到 `.cache/` |
| `npm run setup` | 初始化本地 `data/` |

## 目录

- `data/` — 一切页面配置与内容（**不入库**）；缺失时构建自动回退 `data.example/`
- `data.example/` — 示例数据（入库），兼作单元测试 fixture
- `src/lib/` — 纯函数层：config / markdown / prefetch / theme / routes / home / data-dir
- `src/layouts/` — `BaseLayout.astro` 站点外壳（导航、主题、语言切换）
- `src/pages/[...slug].astro` — 全站动态路由（默认语言无前缀，其他语言 `/en/...`）
- `src/styles/global.css` — 语义色变量、杂志网格、排版
- `tests/` — vitest 单元测试

## 测试与验证决策

- 单元测试覆盖全部纯函数层（含主题色校正、路由表生成、home.layout 解析）。
- 集成验证**不跑自动化**（vitest 里跑 `astro build` 太慢）：改为手动执行
  `npm run build` 后静态检查产物——`dist/` 应含 `/index.html`、`/en/index.html`、
  `/research/index.html`，主页含 `home.layout` 驱动的区块挂载点（`data-block` 属性），
  回退页面（如 `/en/research`）顶部有"暂无译文"提示条，`<head>` 含 hreflang 标签。
- KaTeX CSS 为全站加载（字体文件按需下载），不做逐页公式检测。

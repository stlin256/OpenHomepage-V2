# OpenHomepage-V2 开箱即用体验（OOTB）深度调研与优化方案

> 调研日期：2026-09-04 ｜ 基线版本：v0.1.0（master @ 2c8f0b9）
> 本文是 OOTB 专项的总纲文档；各工作流的详细规格见 `docs/specs/15` ~ `docs/specs/19`。

## 1. 现有基础与核心优势（经源码核实）

1. **架构解耦优秀**：数据层（`data/`）与源码层严格分离，`data/` 被 gitignore 保护，隐私安全。
2. **兜底韧性**：`src/lib/data-dir.ts` 在 `data/` 缺失时回退 `data.example/`，克隆后 `npm run dev` 零配置可跑通；`admin/server/setup.ts` 的 `ensureDataDir()` 在后台启动时同样自动初始化。
3. **后台体验扎实**：`npm run admin`（`admin/server/index.ts`）管理本地 Web 服务 + Astro dev server 生命周期，支持基于真实渲染页面的 Overlay 直编；`admin/server/export.ts` 已实现零依赖的 `data.zip` 导出（手写 deflate zip）。
4. **CI 部署成熟**：`.github/workflows/deploy.yml` 支持 `DATA_SOURCE_URL` 远程拉取数据、失败时快照恢复。

## 2. 当前开箱摩擦点（Friction Points）

| # | 旅程阶段 | 痛点 | 现状证据 |
|---|---------|------|---------|
| 1 | 发现项目 | 无一键云沙盒 | README 无 StackBlitz / Codespaces 徽章，无 `.devcontainer/` |
| 2 | 克隆安装 | 环境版本无检查 | `package.json` 无 `engines` 字段，无预检脚本 |
| 3 | 首次初始化 | 全量示例覆盖、无向导 | `scripts/setup.mjs` 仅 18 行：粗暴 `cpSync('data.example', 'data')` |
| 4 | 内容定制 | 四语认知负荷高；Bib 录入累 | `data.example/pages/` 含 zh/en/ja/fr 四语全套；`publications.yaml` 需手写 |
| 5 | 本地排错 | 缺少 Doctor 自检 | 无配置校验 / 素材引用检查工具，错误暴露晚 |
| 6 | 上线部署 | 渠道单一 | 仅 GitHub Actions + Pages，无 Vercel / Netlify / Docker 模板 |
| 7 | 数据迁移 | 只出不进 | 后台有「导出 data.zip」（export.ts），无对应导入能力 |

## 3. 优化方案体系（五大支柱）

```
┌───────────────────────────────────────────────────────────────────────┐
│                  OpenHomepage-V2 开箱即用体验提升体系                  │
├──────────────────┬──────────────────┬──────────────────┬──────────────┤
│ 1. 交互式初始化  │ 2. 后台自动化赋能 │ 3. 诊断健康自检  │ 4. 场景化模板 │
│  CLI Wizard      │ Admin Onboarding │ npm run doctor   │ Starter Kits │
├──────────────────┴──────────────────┴──────────────────┴──────────────┤
│              5. 全生态多平台一键部署 (Multi-Platform Deploy)           │
└───────────────────────────────────────────────────────────────────────┘
```

### 支柱一：交互式 CLI 初始化向导 → spec `docs/specs/15-setup-wizard.md`

将 `npm run setup` 从"静默全量复制"升级为三模式交互向导：

1. **⚡ 快速向导**：输入姓名 / Tagline / GitHub 用户名（可选拉取 GitHub API 预填）→ 选择语言体系（仅中文 / 仅英文 / 中英双语 / 四语）→ 勾选功能模块（学术成果、GitHub 卡片、RSS、BGM、二维码联系）→ 生成干净的个性化 `data/`。
2. **📦 完整示例**：等同现有行为，复制 `data.example/` 全量演示站。
3. **📄 纯净空白**：仅保留最小页面骨架。

约束：纯 Node 实现（readline），零新增依赖；非交互环境（CI / 管道）自动回退现有复制行为；`data/` 已存在时保持跳过语义不变。

### 支柱二：Admin 后台自动化赋能 → spec `docs/specs/18-admin-data-import.md`、`docs/specs/19-admin-onboarding.md`

- **BibTeX 一键导入**（spec 18）：后台粘贴 / 拖入 `.bib`，前端解析映射为 `publications.yaml` 条目，自动归类 journal / conference / preprint，走既有快照保存链路。
- **data.zip 导入**（spec 18）：与 `admin/server/export.ts` 对称的导入端点 + 顶栏「📥 导入」按钮，覆盖前自动留存安全快照。
- **首次启动欢迎向导**（spec 19）：检测到 `data/` 为新建状态时弹出三步卡片（个人名片 → 模块编排 → 主题色盘），支持 GitHub 信息自动同步。
- **语言管理面板**（spec 19，本期仅出规格不实现）：勾选式启停语言，停用语言归档至 `data/.archived_langs/`。

### 支柱三：健康自检助手 `npm run doctor` → spec `docs/specs/16-doctor.md`

新增 `scripts/doctor.ts`，一体化输出检查报告：

- 运行环境：Node 版本 ≥ 18.17；
- 数据目录：`data/` 结构、`site.yaml` 解析、语言配置一致性；
- 本地素材：Markdown / YAML 中引用的 `assets/` 文件存在性；
- 指令语法：`:::note` / `::stream` / `::::grid` 等容器闭合校验；
- 外部接口（可选 `--offline` 跳过）：GitHub API 连通性与 rate limit、RSS 源响应；
- 端口占用：4321（dev）/ 4174（admin）；
- 退出码：致命错误非零，可接入 CI / prebuild。

### 支柱四：场景化预设模板库（本期出规格，随向导落地）

| 预设 | 适用人群 | 核心模块 |
|------|---------|---------|
| 🎓 Scholar | 教授 / 博士 / 研究员 | `::publications`、时间轴、BibTeX 复制 |
| 💻 Developer | 工程师 / 开源作者 | 热力图、Pinned 仓库、`::stream` 打字机 |
| 🎨 Creator | 摄影 / 设计 / 博主 | 画廊网格、灯箱、BGM 抽屉 |
| ⚡ Minimal | 极简名片 | Profile、社交聚合、QR 浮卡 |

实现路径：不作为独立目录维护，而是作为 setup 向导（spec 15）的"模块勾选预设"内置，避免多份数据副本的维护成本。

### 支柱五：全生态一键部署 → spec `docs/specs/17-deployment.md`

- **Template Repository**：README 增加 "Use this template" 徽章（仓库设置在 GitHub 网页端开启，文档说明）。
- **Vercel / Netlify**：`vercel.json` / `netlify.toml` + README Deploy 按钮。
- **Docker**：多阶段 `Dockerfile`（node 构建 → nginx:alpine 托管 `dist/`）+ `docker-compose.yml` + `.dockerignore`。
- **云沙盒**：`.devcontainer/devcontainer.json` + README 的 Codespaces / StackBlitz 徽章。

## 4. 实施路线（Roadmap）

| 阶段 | 内容 | 产出 |
|------|------|------|
| P0 | 本文档 + 各工作流 spec（15~19） | docs/ |
| P1 | setup 向导（15）、doctor（16）、部署模板（17）、BibTeX/zip 导入（18） | 可运行代码 + 测试 |
| P2 | Admin 新手引导弹窗（19 上半）、README/AGENTS 同步 | 可运行代码 |
| P3 | 语言管理面板（19 下半）、模板库细化 | 后续迭代 |

## 5. 验收标准

- 新用户 `git clone → npm install → npm run setup`：30 秒内通过向导生成个性化 `data/`，`npm run dev` 首屏即为本人信息。
- `npm run doctor` 能在构建前拦截素材引用失效与 YAML 语法错误，退出码可供 CI 使用。
- README 提供 GitHub Template / Vercel / Netlify / Docker / Codespaces 至少 4 种零本地环境或一键部署入口。
- 后台可完成 `.bib` 导入与 `data.zip` 双向迁移，全程有快照兜底。

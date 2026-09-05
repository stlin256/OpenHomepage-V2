# Contributing to OpenHomepage V2

Thanks for your interest in contributing! This document explains how to set up the project locally, the quality gates every change must pass, and the conventions we follow.

[中文说明见下文](#贡献指南)

## Getting Started

**Prerequisites:** Node.js >= 18.17 (Node 24 recommended) and npm.

```bash
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install
npm run setup   # interactive wizard; falls back to full example data in non-TTY environments
npm run dev     # local dev server
```

`data/` holds your private content and is git-ignored. If you skip `npm run setup`, copy `data.example/` to `data/` manually.

## Quality Gates

Every pull request must pass CI (`.github/workflows/ci.yml`). Run locally before pushing:

```bash
npm run check   # astro check — type checking (.astro + .ts)
npm test        # vitest run — unit tests
npm run lint    # ESLint
```

- Add or update tests for behavior changes; the test suite lives in `tests/`.
- Keep changes minimal and scoped — a tidy, reviewable diff beats opportunistic cleanups.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server with font generation |
| `npm run build` | Full production build (fonts → OG images → astro → CSS/image optimization) |
| `npm run admin` | Browser-based admin panel (content, config, publish) |
| `npm run doctor` | Offline health check (`--online` also probes GitHub API / RSS) |
| `npm run prefetch` | Refresh GitHub / RSS dynamic data into `.cache/` |

## Project Layout

- `src/` — Astro site (components, layouts, pages, styles, client scripts)
- `admin/` — Admin panel (server, UI, shared)
- `scripts/` — Build/utility scripts (setup, doctor, prefetch, …)
- `data.example/` — Sample content; copy to `data/` for your own site
- `docs/` — Design docs and specs (`docs/specs/`)
- `tests/` — Vitest suite

## Conventions

- Match the surrounding code style; check `AGENTS.md` for subsystem notes and keep it current when you change documented behavior.
- Do not bump the version number or create release tags unless a maintainer asks (see the version policy in `AGENTS.md`).
- Commit messages: concise, imperative, and scoped (e.g. `fix(search): …`, `docs: …`).

## Reporting Bugs & Proposing Features

- Search [existing issues](https://github.com/stlin256/OpenHomepage-V2/issues) first.
- Use the issue templates; include reproduction steps, expected vs. actual behavior, and your environment (OS, Node version).
- For security issues, **do not** open a public issue — see [SECURITY.md](SECURITY.md).

---

## 贡献指南

感谢你的贡献意愿！

**环境要求：** Node.js >= 18.17（推荐 Node 24）与 npm。

```bash
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install
npm run setup   # 交互式初始化向导；非交互环境自动回退为完整示例数据
npm run dev     # 本地开发服务器
```

`data/` 存放私有内容且已被 git 忽略；若跳过向导，请手动将 `data.example/` 复制为 `data/`。

### 质量门禁

每个 PR 必须通过 CI（`.github/workflows/ci.yml`）。推送前请本地执行：

```bash
npm run check   # astro check —— 类型检查（.astro + .ts）
npm test        # vitest run —— 单元测试
npm run lint    # ESLint
```

- 行为变更请同步补充/更新 `tests/` 中的测试。
- 保持改动最小且聚焦——整洁易审的 diff 优于顺手清理。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发服务器（含字体生成） |
| `npm run build` | 完整生产构建（字体 → OG 图 → astro → CSS/图片优化） |
| `npm run admin` | 图形化后台（内容、配置、发布闭环） |
| `npm run doctor` | 离线健康自检（`--online` 追加 GitHub API / RSS 探测） |
| `npm run prefetch` | 刷新 GitHub / RSS 动态数据到 `.cache/` |

### 约定

- 代码风格与周边保持一致；各子系统约定见 `AGENTS.md`，改动相关行为时请同步更新。
- 未经维护者要求，不要递增版本号或打 release tag（见 `AGENTS.md` 版本维护机制）。
- Commit message：简洁、祈使句、带作用域（如 `fix(search): …`、`docs: …`）。

### 反馈问题与功能建议

- 先搜索[已有 issue](https://github.com/stlin256/OpenHomepage-V2/issues)。
- 使用 issue 模板，附复现步骤、预期/实际行为与环境信息（OS、Node 版本）。
- 安全问题**不要**公开提 issue，请参阅 [SECURITY.md](SECURITY.md)。

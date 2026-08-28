# OpenHomepage V2

[![Demo](https://img.shields.io/badge/Demo-Live%20Preview-blue?style=flat-square&logo=github)](https://stlin256.github.io/OpenHomepage-V2/)
[![Deploy](https://github.com/stlin256/OpenHomepage-V2/actions/workflows/deploy.yml/badge.svg)](https://github.com/stlin256/OpenHomepage-V2/actions/workflows/deploy.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/stlin256/OpenHomepage-V2)

[中文文档](README.zh-CN.md) · [Live Demo](https://stlin256.github.io/OpenHomepage-V2/)

OpenHomepage V2 is a static, magazine-style personal homepage generator built with Astro. Designed with scholarly restraint and editorial typography, it is driven entirely by a local `data/` folder containing plain Markdown and YAML configuration files, and deployed seamlessly to GitHub Pages via GitHub Actions.

## Core Capabilities

- **Markdown & Directive Pipeline** — Standard GFM extended with Shiki dual-theme syntax highlighting, KaTeX mathematics, and expressive custom directives (`::bilibili`, `::youtube`, `:::video`, `:::audio`, `:::figure`, `::::grid`, `::stream`, `::ghcard`, `::editorial`).
- **Editorial Typography & Magazine Layout** — Asymmetric 12-column grid, restrained transform/opacity animations, configurable accent colors, and automatic light/dark theme switching (follows system preference with session override).
- **Responsive Image Optimization** — Production builds create multiple WebP + AVIF widths, serve AVIF first via `<picture>` when the browser supports it (WebP as fallback), and select the smallest clear candidate from the current layout and device pixel ratio. Aggressive idle prefetch covers language alternates and same-language tabs plus their AVIF candidates without a byte cap, while prefetch-only Speculation Rules warm hover targets in Chromium. Fetched HTML feeds a shared in-memory cache, so language switches are near-instant; originals and `-full` lightbox sources remain excluded from preloading.
- **Dynamic Content Prefetching** — Build-time fetcher with intelligent cache fallback for GitHub contribution heatmaps, official-style pinned repository cards, and multi-source RSS content streams.
- **Interactive Multimedia** — Full-screen image lightbox with automatic `-full` resolution detection, persistent background audio across client navigation, and LLM-style typewriter markdown playback.
- **Zero-Friction Multilingual Architecture** — Add language subdirectories under `data/pages/<lang>/` to automatically activate routing, navigation, and multilingual configuration fields, complete with graceful fallback rendering. The bundled demo ships in 中文 / English / 日本語 / Français.
- **Local Visual Editor (PC)** — Built-in local admin console (`npm run admin`) with on-page visual editing (hover outlines, in-place text editing, directive inspector, block insert/reorder/drag-and-drop, undo/redo), fallback whole-page markdown source editing, full-site config forms, automatic snapshots, and one-click data export.
- **Self-Hosted Static Server** — Direct production static serving via `npm run serve` with optional SSL certificate support.
- **Data Privacy & Decoupled CI** — Local `data/` content is git-ignored. GitHub Actions supports private data synchronization via secret URL, snapshot fallback, and demo mode.

## Component Gallery

Each component below is captured individually from the production build (`npm run screenshots`) — what you see is exactly what ships.

### Homepage Blocks

**Profile Block** — Avatar (with automatic palette extraction), name, tagline, and social/research links.

![Profile Block](docs/images/components/profile-en.webp)

**LLM Streaming Block (`StreamBlock`)** — Typewriter-style playback of pre-written markdown, with replay control and adjustable speed.

![LLM Streaming Block](docs/images/components/stream-en.webp)

**Editorial Blocks (`::editorial`)** — Magazine sections mixing action buttons, numbered list cards, image tiles, archive cards, and dividers; fully defined in `site.yaml`.

![Editorial block: actions and list cards](docs/images/components/editorial-list-en.webp)

![Editorial block: tiles and archive cards](docs/images/components/editorial-tiles-en.webp)

**GitHub Contribution Heatmap** — GraphQL-prefetched calendar with a 5-level accent-derived scale, month/weekday axes, and per-day tooltips. Theme scales are injected once on the block root instead of being repeated across every cell.

![GitHub contribution heatmap](docs/images/components/github-heatmap-en.webp)

**Pinned Repository Cards** — 1:1 GitHub styling with language color dots, star/fork counts, topics, and localized relative timestamps.

![Pinned repository cards](docs/images/components/github-repos-en.webp)

**RSS Block (`RssBlock`)** — Multi-source article cards with feed tags, dates, lazy-loaded covers, and curated picks (`latest` / `curated`).

![RSS block](docs/images/components/rss-en.webp)

### Markdown & Directive Rendering

**Dual-Theme Code Highlighting** — Shiki with light/dark palettes bound to the site theme.

![Shiki code highlighting](docs/images/components/markdown-code-en.webp)

**KaTeX Mathematics** — Inline `$...$` and display math rendered natively.

![KaTeX math](docs/images/components/markdown-math-en.webp)

**Structured Figures (`:::figure`)** — Alignment, explicit width constraints, and styled captions.

![Figure directive](docs/images/components/markdown-figure-en.webp)

**Magazine Grids (`::::grid` / `:::cell`)** — 12-column asymmetric layouts that collapse gracefully on mobile.

![Grid directive](docs/images/components/markdown-grid-en.webp)

**Native Media (`:::audio` / `:::video`)** — Magazine-width players; `::bilibili` / `::youtube` render responsive 16:9 embed frames.

![Audio directive](docs/images/components/media-audio-en.webp)

**GitHub Repo Card (`::ghcard`)** — Embed any pinned repository card inline in markdown.

![ghcard directive](docs/images/components/ghcard-en.webp)

### Global UI & Interactions

**Header Tools** — Persistent background music toggle, language switcher, and zero-flash theme toggle.

![Header tools](docs/images/components/header-tools-en.webp)

**Language Switcher** — One directory per language under `data/pages/`; the demo ships 中文 / English / 日本語 / Français with graceful fallback.

![Language switcher](docs/images/components/lang-switcher-en.webp)

**Notice Banner (`NoticeBanner`)** — Per-page frontmatter announcement bar with accent / yellow / red / custom colors.

![Notice banner](docs/images/components/notice-banner-en.webp)

**Contact Card & QR Modal (`ContactCard`)** — A floating card slides in after a configurable delay; clicking it opens the full-screen QR modal.

![Contact card](docs/images/components/contact-card-en.webp)

![QR code modal](docs/images/components/qr-modal-en.webp)

**Photo Gallery & Lightbox** — Grid galleries with captions; every image opens a full-screen lightbox with automatic `-full` resolution loading.

![Gallery grid](docs/images/components/gallery-grid-en.webp)

![Image lightbox](docs/images/components/lightbox-en.webp)

**Dark Theme** — Follows the system with session override; every component is dual-themed.

![Dark theme](docs/images/components/profile-dark-en.webp)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Initialize data directory from bundled sample
npm run setup

# 3. Start local development server
npm run dev

# 4. (Optional) Run tests and static production build
npm test
npm run build
```

*Note: If no `data/` folder is initialized, the site automatically falls back to `data.example/` for local preview and build.*

## CLI Commands

| Command | Description | Default URL | Lifecycle |
|---|---|---|---|
| `npm run admin` | Local visual editor (automatically manages companion preview server) | http://127.0.0.1:4174 + http://localhost:4321 | Press `Ctrl+C` to terminate both |
| `npm run dev` | Astro dev server with hot module reloading | http://localhost:4321 | Press `Ctrl+C` |
| `npm run prefetch` | Fetch remote GitHub activity and RSS articles into `.cache/` | — | Exits on completion |
| `npm test` | Run Vitest unit and integration test suite | — | Exits on completion |
| `npm run build` | Static production build with automatic WebP + AVIF image optimization (`WEBP_QUALITY` 80 / `AVIF_QUALITY` 50 by default) | — | Exits on completion |
| `npm run preview` | Preview static output in `dist/` | http://localhost:4321 | Press `Ctrl+C` |
| `npm run serve` | Standalone static server with optional HTTPS | http://localhost:8080 (or https://localhost:8443) | Press `Ctrl+C` |
| `npm run screenshots` | Regenerate the component gallery images above from `dist/` (requires `npm run build` and a one-time `npx playwright install chromium`) | — | Exits on completion |

## Visual Editor

Launch the editor locally on your PC:

```bash
npm run admin       # Access at http://127.0.0.1:4174 (loopback only)
```

- **On-Page Visual Editing**: The "Visual editing" button opens the real rendered page in edit mode — hover outlines, in-place text editing, a right-side inspector for directive parameters and grid columns, block insert/drag-reorder/cross-container move/delete, undo/redo (Ctrl+Z), a stream-block content editor modal with live preview (content fully expanded while editing), homepage config block forms, and page settings.
- **Source Fallback**: The admin page view keeps a frontmatter form and whole-page Markdown source editor (autosaves after idle).
- **Comprehensive Configuration**: Manage profile links, favicon generation, theme accent colors, GitHub settings, RSS subscriptions, streaming blocks, and homepage layout ordering.
- **Autosave & Version Snapshots**: Changes write to disk automatically after ~1.5s idle, with historical versions archived in `data/.snapshots/` for rollback.
- **Data Export**: The "Export data.zip" button archives your entire `data/` structure for secure hosting and CI consumption.

## Deployment & CI/CD

GitHub Actions automatically builds and publishes the static site to GitHub Pages on pushes to `main`/`master` and on a scheduled basis (every 8 hours).

### GitHub Secrets Configuration

| Secret | Description | Required |
|---|---|---|
| `ENABLE_EXAMPLE` | Set to `true` to deploy the demo showcase site using bundled `data.example/` in production mode | Optional (Demo Mode) |
| `DATA_SOURCE_URL` | Direct URL to download your private `data.zip` archive | Required for private data |
| `GH_PAT` | Personal Access Token (`read:user`) for GitHub contribution calendar GraphQL API | Optional |

- **Demo Deployment**: Setting `ENABLE_EXAMPLE` to `true` allows the repository to deploy a live showcase without exposing private personal data.
- **Fail-Safe Fallback**: If `DATA_SOURCE_URL` is unreachable, CI automatically falls back to the previous deployment snapshot, updates dynamic GitHub/RSS blocks, and triggers an email notification.

## Project Structure

```
├── data.example/    # Bundled sample data and assets (tracked in git)
├── data/            # User content and configuration (git-ignored)
├── docs/            # Architecture and technical specifications
├── scripts/         # Prefetch, setup, and static server scripts
├── src/             # Astro source code, components, layouts, and libraries
├── admin/           # Local visual editor application
└── tests/           # Vitest test suite
```

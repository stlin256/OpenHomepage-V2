# OpenHomepage V2

[中文文档 → README.zh-CN.md](README.zh-CN.md)

A lightweight, magazine-style personal homepage generator — static, bilingual (zh/en), and driven entirely by a local `data/` folder of markdown and YAML. Built with Astro; deployed to GitHub Pages via GitHub Actions.

## Features

- **Markdown-first content** — pages are plain markdown files with frontmatter; rendered with GFM, Shiki syntax highlighting, KaTeX math, and custom directives (`::bilibili`, `::youtube`, `:::video`, `:::audio`, `:::figure`, `::::grid`, `::stream`, `::ghcard`), plus safe raw-HTML mixing.
- **Magazine layout, researcher-grade restraint** — asymmetric 12-column grid, expressive yet cheap animations (transform/opacity only), dark/light themes (two-state toggle; follows your system until you pick — the choice sticks for the session and resets once you leave) with a configurable accent color.
- **Image lightbox** — click any content image to preview it full-screen (scale/fade animation, reduced-motion aware); a same-named `-full` file (e.g. `assets/hero-full.jpg`) is loaded automatically when present.
- **Background music (optional)** — configure `bgm` in `site.yaml` and a play/pause button appears in the header; `transition:persist` keeps it playing across in-site navigations, remembers the user's choice, and respects autoplay policies and reduced-motion.
- **GitHub blocks** — contribution heatmap and pinned repo cards, fetched at build time with cache fallback.
- **RSS cards** — multiple feeds, grouped or weighted-mixed display, hover previews, curated article lists with per-card covers.
- **LLM-style streaming blocks** — pre-written markdown replayed with a realistic streaming effect.
- **Optional i18n** — add a second language folder under `data/pages/` and the whole site (routes, nav, fallback chain) lights up automatically; the language switcher only appears when the current page has a real translation.
- **Visual editor (PC)** — `npm run admin` launches a local WordPress-like editor (WYSIWYG via Milkdown) for pages and all configuration, with autosave, version snapshots, and a theme color picker.
- **Private data, public repo** — `data/` is git-ignored; CI downloads it from a secret URL, with snapshot fallback and e-mail notification via GitHub's built-in failure alerts.

## Quick start

```bash
npm install
npm run setup       # copies data.example/ → data/ (skipped if data/ exists)
npm run prefetch    # fetches GitHub + RSS data into .cache/ (optional for a first look)
npm run dev         # local preview
npm test            # run the test suite
npm run build       # static build → dist/
```

Without a `data/` folder the site falls back to the bundled `data.example/` (a complete AI-themed demo) with a warning.

## Visual editor

```bash
npm run admin       # → http://127.0.0.1:4174 (loopback only)
```

- **Pages** — sidebar groups pages by language folder; Milkdown WYSIWYG editing with the custom directives rendered as parameter cards; frontmatter (title/nav/order/slug/description) as a form bar; new-page wizard (title → auto slug + template), rename, delete, and one-click "create the other-language version". `Ctrl+V` pastes images straight into `data/assets/` and inserts the reference.
- **Config** — forms for site/profile/links, background music (toggle, asset-library file picker, volume slider), GitHub (username, contributions toggle, pinned repos with up/down ordering), RSS (sources with mode/latest/weight/cover and curated article sub-lists), streaming blocks, and a drag-sortable `home.layout`.
- **Theme** — palette of 4–6 colors extracted from your avatar, click-anywhere pixel picking on the avatar, or manual hex; writes back `theme.accent` with live preview.
- **Assets** — list/upload (file picker or drag & drop)/delete/copy reference path.
- **Autosave & snapshots** — edits are written to disk after ~1.5s idle; every write snapshots the previous version to `data/.snapshots/<path>/<timestamp>` (latest 20 kept), with list/restore in the UI. Writes are schema-validated first and rejected with a message on failure.
- The editor UI is bilingual (zh/en, switcher in the top bar, remembered in localStorage). If `data/` is missing on first launch it is initialized from `data.example/` automatically.

Details: [docs/specs/06-editor.md](docs/specs/06-editor.md).

## Project layout

```
data.example/   # bundled demo data (tracked) — doubles as test fixtures
data/           # your real content (git-ignored)
docs/           # design docs: docs/design.md + docs/specs/*
skills/         # AI editing guide for the data folder
scripts/        # prefetch / setup scripts
src/            # Astro site source (src/lib = pure functions, fully unit-tested)
admin/          # visual editor (admin/server = local API, admin/ui = SPA, admin/shared = pure logic)
tests/          # vitest suite
```

## Deployment

GitHub Actions builds and deploys to GitHub Pages on push and on a schedule (every 8 hours at half past). Required secrets:

| Secret | Purpose |
|--------|---------|
| `DATA_SOURCE_URL` | Direct URL to a zip of your `data/` folder |
| `GH_PAT` | GitHub PAT (`read:user`) for the contribution graph |

If the online source fails, CI restores `data/` from the snapshot embedded in the last deployment, refreshes only the dynamic blocks (GitHub/RSS), deploys, then marks the run as failed so you get an e-mail reminder. Details: [docs/specs/08-workflow.md](docs/specs/08-workflow.md).

## Documentation

The design docs live under `docs/` (start with [docs/design.md](docs/design.md)). The `skills/editing-data` folder teaches AI agents how to edit `data/` safely.

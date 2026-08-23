# OpenHomepage V2

[中文文档 → README.zh-CN.md](README.zh-CN.md)

A lightweight, magazine-style personal homepage generator — static, bilingual (zh/en), and driven entirely by a local `data/` folder of markdown and YAML. Built with Astro; deployed to GitHub Pages via GitHub Actions.

## Features

- **Markdown-first content** — pages are plain markdown files with frontmatter; rendered with GFM, Shiki syntax highlighting, KaTeX math, and custom directives (`::bilibili`, `::youtube`, `:::video`, `:::audio`, `:::figure`, `::::grid`, `::stream`, `::ghcard`), plus safe raw-HTML mixing.
- **Magazine layout, researcher-grade restraint** — asymmetric 12-column grid, expressive yet cheap animations (transform/opacity only), dark/light themes (two-state toggle; follows your system until you pick — the choice sticks for the session and resets once you leave) with a configurable accent color.
- **Image lightbox** — click any content image to preview it full-screen (scale/fade animation, reduced-motion aware); a same-named `-full` file (e.g. `assets/hero-full.jpg`) is loaded automatically when present.
- **Background music (optional)** — configure `bgm` in `site.yaml` and a play/pause button appears in the header; `transition:persist` keeps it playing across in-site navigations, remembers the user's choice, and respects autoplay policies and reduced-motion.
- **GitHub blocks** — contribution heatmap and pinned repo cards, fetched at build time with cache fallback.
- **RSS cards** — multiple feeds, grouped or weighted-mixed display, curated article lists with per-card covers; cards link straight to the original article.
- **LLM-style streaming blocks** — pre-written markdown replayed with a realistic streaming effect.
- **Optional i18n** — add a second language folder under `data/pages/` and the whole site (routes, nav, fallback chain) lights up automatically; the language switcher only appears when the current page has a real translation.
- **Visual editor (PC)** — `npm run admin` launches a local WordPress-like editor (WYSIWYG via Milkdown) for pages and all configuration, with three editing modes (WYSIWYG / markdown source / split live-preview), a one-click dev preview server, autosave, version snapshots, a theme color picker, and a light/dark UI theme.
- **Self-hosted static server** — `npm run serve` serves `dist/` directly (multi-page static output, correct MIME types, 404 page), with optional SSL: explicit `serve.ssl` in `site.yaml`, or the `certs/cert.pem` + `certs/key.pem` convention; missing/invalid certificates print a warning and fall back to HTTP.
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

## Daily usage: starting and stopping

All commands are long-running local servers (except one-shot ones); they print their URL on start.

| Command | What it does | URL | How to stop |
|---------|--------------|-----|-------------|
| `npm run dev` | Site dev server with hot reload — preview your edits live | http://localhost:4321 | Focus the terminal and press `Ctrl+C` |
| `npm run admin` | Visual editor | http://127.0.0.1:4174 | Focus the terminal and press `Ctrl+C` |
| `npm run prefetch` | One-shot: fetch GitHub/RSS data into `.cache/` | — | exits by itself |
| `npm test` | One-shot: run the test suite | — | exits by itself |
| `npm run build` | One-shot: static build → `dist/` | — | exits by itself |
| `npm run preview` | Serve the built `dist/` for a final check | http://localhost:4321 | `Ctrl+C` |
| `npm run serve` | Self-hosted static server for `dist/` (optional HTTPS, see below) | http://localhost:8080 (or https://localhost:8443) | `Ctrl+C` |

Typical session:

```bash
npm run dev         # terminal 1: live preview at :4321 — keep it running
npm run admin       # terminal 2: editor at :4174 — make your edits here
# ...edit, watch the preview update; when done:
# Ctrl+C in each terminal to stop. Closing the terminal window also works.
```

Notes:

- The two servers are independent — run either one alone if you only need it. In the editor's split-preview mode, if the dev server isn't running you can click "Start preview server" to let the editor spawn it; the editor stops that child process when it exits.
- If a port is busy (e.g. from a forgotten dev server), run `npx astro dev stop`, or find the PID with `netstat -ano | findstr :4321` and `taskkill /PID <pid> /F`; closing the old terminal also works.
- `.cache/` is reused across runs; use `npm run prefetch -- --force` to bypass the 1-hour TTL.

## Visual editor

```bash
npm run admin       # → http://127.0.0.1:4174 (loopback only)
```

- **Pages** — sidebar groups pages by language folder; Milkdown WYSIWYG editing with the custom directives rendered as parameter cards; frontmatter (title/nav/order/slug/description) as a form bar; new-page wizard (title → auto slug + template), rename, delete, and one-click "create the other-language version". `Ctrl+V` pastes images straight into `data/assets/` and inserts the reference.
- **Editing modes (segmented control)** — **WYSIWYG** (Milkdown), **Source** (plain markdown in a monospace editor, kept in sync both ways via Milkdown's serializer/parser), and **Split preview** (editor on one side, an iframe of the dev-server page on the other; if the dev server is down, a "Start preview server" button spawns it — the editor kills that child process on exit). Every autosave refreshes the preview.
- **Config** — forms for site/profile/links, background music (toggle, asset-library file picker, volume slider), GitHub (username, contributions toggle, pinned repos with up/down ordering), RSS (sources with mode/latest/weight/cover and curated article sub-lists), streaming blocks, and a drag-sortable `home.layout`.
- **Theme** — palette of 4–6 colors extracted from your avatar, click-anywhere pixel picking on the avatar, or manual hex; writes back `theme.accent` with live preview.
- **Assets** — list/upload (file picker or drag & drop)/delete/copy reference path.
- **Autosave & snapshots** — edits are written to disk after ~1.5s idle; every write snapshots the previous version to `data/.snapshots/<path>/<timestamp>` (latest 20 kept), with list/restore in the UI. Writes are schema-validated first and rejected with a message on failure.
- The editor UI is bilingual (zh/en, switcher in the top bar, remembered in localStorage) and has a light/dark theme toggle (small square button in the top bar, remembered in localStorage, follows the system by default). If `data/` is missing on first launch it is initialized from `data.example/` automatically.

Details: [docs/specs/06-editor.md](docs/specs/06-editor.md).

## Self-hosted static server (npm run serve)

After `npm run build`, you can serve `dist/` on your own machine instead of GitHub Pages:

```bash
npm run build
npm run serve       # → http://localhost:8080
```

- Multi-page static output as-is (correct MIME types, `/research` → `research/index.html` directory index, 404 page fallback) — no SPA rewrite.
- **HTTPS**: configure it in `site.yaml`:

  ```yaml
  serve:
    port: 8443
    ssl:
      cert: "certs/cert.pem"
      key: "certs/key.pem"
  ```

  Or by convention: drop `cert.pem` + `key.pem` into a `certs/` folder at the project root (default port 8443). A self-signed pair works: `openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 3650 -nodes -subj "/CN=your.domain"` (browsers will warn about the untrusted certificate — proceed past it; `certs/` is git-ignored).
- Missing files, unparseable PEM, or a cert/key mismatch print a warning and fall back to HTTP; an expired certificate only warns.

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

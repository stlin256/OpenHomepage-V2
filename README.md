# OpenHomepage V2

[中文](README.zh-CN.md)

A lightweight, magazine-style personal homepage generator — static, bilingual (zh/en), and driven entirely by a local `data/` folder of markdown and YAML. Built with Astro; deployed to GitHub Pages via GitHub Actions.

## Features

- **Markdown-first content** — pages are plain markdown files with frontmatter; rendered with GFM, Shiki syntax highlighting, KaTeX math, and custom directives (`::bilibili`, `::youtube`, `:::video`, `:::audio`, `:::figure`, `::::grid`, `::stream`, `::ghcard`), plus safe raw-HTML mixing.
- **Magazine layout, researcher-grade restraint** — asymmetric 12-column grid, expressive yet cheap animations (transform/opacity only), dark/light themes (two-state toggle; follows your system until you pick — the choice sticks for the session and resets once you leave) with a configurable accent color.
- **Image lightbox** — click any content image to preview it full-screen (scale/fade animation, reduced-motion aware); a same-named `-full` file (e.g. `assets/hero-full.jpg`) is loaded automatically when present.
- **Background music (optional)** — configure `bgm` in `site.yaml` and a play/pause button appears in the header; `transition:persist` keeps it playing across in-site navigations, remembers the user's choice, and respects autoplay policies and reduced-motion.
- **GitHub blocks** — contribution heatmap (GitHub-style month/weekday axes, per-cell tooltips, Less→More legend, custom scrollbar) and pinned repo cards mirroring github.com (octicons, topic pills, language dots, stars/forks/relative updated time), fetched at build time with cache fallback.
- **RSS cards** — multiple feeds, grouped or weighted-mixed display, curated article lists with per-card covers; when a curated entry declares no cover, its article page's `og:image` is scraped at prefetch time (fallback: `twitter:image` → first content `<img>`), and a cover that fails to load hides its slot; cards link straight to the original article.
- **LLM-style streaming blocks** — pre-written markdown replayed with a realistic streaming effect.
- **Editorial content blocks** — structured list cards, image tiles, archive cards, action buttons, and section dividers for a warm magazine-style homepage; the features page renders a labeled inventory of site components.
- **Optional i18n** — add a second language folder under `data/pages/` and the whole site (routes, nav, bilingual config fields) lights up automatically; the language switcher (a translate icon with a popup menu in the header) only appears when the current page has a real translation. Missing translations render silently through the fallback chain.
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
| `npm run admin` | Visual editor (**also starts the site preview server automatically**; adopts an already-running one instead of spawning a duplicate) | http://127.0.0.1:4174 + http://localhost:4321 | `Ctrl+C` in that terminal (the preview server stops with it) |
| `npm run dev` | Site dev server only (hot reload; use when you don't need the editor) | http://localhost:4321 | `Ctrl+C` |
| `npm run prefetch` | One-shot: fetch GitHub/RSS data into `.cache/` | — | exits by itself |
| `npm test` | One-shot: run the test suite | — | exits by itself |
| `npm run build` | One-shot: static build → `dist/` | — | exits by itself |
| `npm run preview` | Serve the built `dist/` for a final check | http://localhost:4321 | `Ctrl+C` |
| `npm run serve` | Self-hosted static server for `dist/` (optional HTTPS, see below) | http://localhost:8080 (or https://localhost:8443) | `Ctrl+C` |

Typical session (one command starts everything):

```bash
npm run admin       # editor at :4174 + site preview at :4321 come up together
# ...edit, watch the preview update; when done:
# one Ctrl+C stops the editor and the preview server it spawned (closing the terminal also works)
```

Notes:

- The top bar has a preview-server status light (green = running / amber = starting / gray = stopped); click it to stop/start manually. The editor only kills processes it spawned — your own `npm run dev` is left alone.
- If a port is busy (e.g. from a forgotten dev server), run `npx astro dev stop`, or find the PID with `netstat -ano | findstr :4321` and `taskkill /PID <pid> /F`; closing the old terminal also works.
- `.cache/` is reused across runs; use `npm run prefetch -- --force` to bypass the 1-hour TTL.

## Visual editor

```bash
npm run admin       # → http://127.0.0.1:4174 (loopback only)
```

- **Pages** — sidebar groups pages by language folder; Milkdown WYSIWYG editing with the custom directives rendered as **live preview cards** (figure renders the actual asset image, bilibili/youtube/video/audio get player-style cards, ghcard draws a repo card from the pinned cache, stream shows title + excerpt, editorial shows the block title, description and component counts, grid gets a visible bordered multi-column layout) with a hover pencil button opening the parameter panel; frontmatter (title/nav/order/slug/description) as a form bar; new-page wizard (title → auto slug + template), rename, delete, and one-click "create the other-language version". `Ctrl+V` pastes images straight into `data/assets/` and inserts the reference.
- **Editing modes (segmented control)** — **WYSIWYG** (Milkdown), **Source** (plain markdown in a monospace editor, kept in sync both ways via Milkdown's serializer/parser), and **Split preview** (editor on one side, an iframe of the dev-server page on the other; if the dev server is down, a "Start preview server" button spawns it — the editor kills that child process on exit). Every autosave refreshes the preview.
- **Config** — forms for site/profile/links/favicon (svg/png/ico picker from the asset library, or upload any image — it is center-cropped square and converted to 180×180/32×32 PNGs written back to the config), background music (toggle, asset-library file picker, volume slider), **footer** (on by default; toggle + bilingual text with inline `[label](url)` links), GitHub (username, contributions toggle, pinned repos with up/down ordering), RSS (sources with mode/latest/weight/cover and curated article sub-lists), streaming blocks, editorial blocks plus the bottom-right contact card, and `home.layout` ordering by drag or move buttons.
- **Theme** — palette of 4–6 colors extracted from your avatar, click-anywhere pixel picking on the avatar, or manual hex; writes back `theme.accent` with live preview.
- **Assets** — list/upload (file picker or drag & drop)/delete/copy reference path.
- **Autosave & snapshots** — edits are written to disk after ~1.5s idle; every write snapshots the previous version to `data/.snapshots/<path>/<timestamp>` (latest 20 kept), with list/restore in the UI. Writes are schema-validated first and rejected with a message on failure.
- The editor UI is bilingual (zh/en, switcher in the top bar, remembered in localStorage) and has a light/dark theme toggle (small square button in the top bar, remembered in localStorage, follows the system by default). If `data/` is missing on first launch it is initialized from `data.example/` automatically.
- **Export data.zip** — the top-bar "Export data.zip" button downloads the whole `data/` folder (including the `.snapshots/` version history) as a zip, ready to be used as the CI `DATA_SOURCE_URL` (see Deployment below).

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

### Hosting data.zip for a direct link

`DATA_SOURCE_URL` needs a URL that serves the zip directly (no login, no interstitial page). The zip produced by the editor's "Export data.zip" button works with any of these:

- **GitHub private-repo release asset**: create a private repo (e.g. `mysite-data`), attach the zip to a release, and use a `https://github.com/<owner>/<repo>/releases/download/<tag>/data.zip` URL (release assets of private repos need token auth — put the token in the workflow's download step);
- **Object storage**: S3 / Cloudflare R2 / Aliyun OSS / Tencent COS — upload the zip and hand out a signed long-lived URL (or public-read, your privacy call);
- **Any static hosting**: your own server/NAS or a static file host — anything that returns the zip bytes directly.

## Documentation

The design docs live under `docs/` (start with [docs/design.md](docs/design.md)). The `skills/editing-data` folder teaches AI agents how to edit `data/` safely.

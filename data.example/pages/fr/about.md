---
title: "À propos"
nav: true
order: 5
slug: "about"
description: "À propos d'OpenHomepage V2 : Générateur de page d'accueil personnelle statique au style magazine"
toc: false
---

<div class="about-hero reveal">
  <div class="about-banner-wrap">
    <div class="about-brand-banner">
      <span class="about-brand-main">OpenHomepage</span>
      <span class="about-brand-v2">V2</span>
    </div>
  </div>
  <p class="about-slogan">
    <strong>Scholarly Restraint Meets Editorial Elegance.</strong>
    <span>A static, magazine-style personal homepage generator crafted for researchers, engineers, and creators.</span>
  </p>
  <div class="about-version-badge">
    <span class="version-pill">
      <span class="version-dot" aria-hidden="true"></span>
      <span>Release</span>
      <span class="version-label">v0.1.0</span>
    </span>
  </div>
</div>

## Présentation

**OpenHomepage V2** est un générateur de page d'accueil personnelle statique de style magazine conçu avec Astro pour les chercheurs, ingénieurs et créateurs. Tout le contenu est piloté par des fichiers Markdown et YAML locaux.

::::grid{cols=2}
:::cell
### 🎨 Typographie Magazine et Notes
- Grille magazine à 12 colonnes avec contrastes élégants et adaptation mobile fluide.
- Formules KaTeX, coloration Shiki et notes de bas de page interactives.
:::
:::cell
### ⚡ Haute Performance et Données
- Rendu purement statique sans surcharge JS et dérivation automatique des images.
- Répertoire `data/` isolé pour protéger les données privées lors du partage.
:::
::::

## Démarrage Rapide

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install && npm run setup && npm run dev
```

:::tip{title="Licence"}
OpenHomepage V2 est distribué sous [Licence MIT](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE).
:::
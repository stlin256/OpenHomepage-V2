---
title: "À propos"
nav: true
order: 5
slug: "about"
description: "À propos d'OpenHomepage V2 : Générateur de page d'accueil personnelle statique au style magazine"
toc: true
---

<div class="about-hero reveal">
  <div class="about-banner-wrap">
    <img class="about-logo about-logo-light" src="assets/logo-banner.webp" alt="OpenHomepage V2" width="360">
    <img class="about-logo about-logo-dark" src="assets/logo-banner-dark.webp" alt="OpenHomepage V2" width="360">
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

## Vision et Philosophie

**OpenHomepage V2** est un générateur de page d'accueil personnelle statique de style magazine conçu avec Astro et TypeScript pour les chercheurs, ingénieurs et créateurs. Tout le contenu et la mise en page sont pilotés par de simples fichiers Markdown et YAML.

:::note{title="Philosophie de design"}
L'expression académique exige sobriété et rigueur, tandis que la mise en page magazine apporte rythme et clarté de lecture. Nous remplaçons les CMS complexes par une livraison statique et la souveraineté locale des données.
:::

## Fonctionnalités Principales

::::grid{cols=2}
:::cell
### 🎨 Typographie Magazine et Grille
- **Grille Magazine à 12 Colonnes** : Contraste de blancs soigné sur bureau, repli élégant sur mobile.
- **Thèmes Clair / Sombre Fluides** : Adaptation instantanée sans flash lumineux via variables CSS.
- **Micro-interactions Légères** : Transitions douces respectant `prefers-reduced-motion`.
:::
:::cell
### 📝 Publications et Médias Riches
- **Index de Publications** : Filtrage multidimensionnel, regroupement et copie BibTeX en un clic.
- **Notes de Bas de Page Interactives** : Popovers intelligents sur bureau et tiroir sur mobile.
- **Mise en Page Scientifique** : Formules KaTeX, coloration Shiki et frise chronologique.
:::
::::

::::grid{cols=2}
:::cell
### ⚡ Performances Extrêmes
- **Génération d'Images Réactives** : Dérivation automatique en WebP et AVIF lors du build.
- **Préchargement Intelligent** : Navigation instantanée entre pages et langues au survol.
- **Zéro Hydratation Client** : Rendu statique ultraléger sans surcharge JavaScript.
:::
:::cell
### 🛡️ Confidentialité et Déploiement
- **Souveraineté des Données** : Dossier `data/` strictement ignoré par Git pour protéger la vie privée.
- **Récupération par Instantané** : CI sécurisée avec basculement automatique sur snapshot.
- **Flux de Syndication Complets** : Génération native RSS 2.0, Atom 1.0 et JSON Feed 1.1.
:::
::::

## Démarrage Rapide

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
# Cloner le dépôt et installer les dépendances
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install

# Initialiser le répertoire de données
npm run setup

# Lancer le serveur de développement
npm run dev
```

:::tip{title="Licence Open Source"}
OpenHomepage V2 est distribué sous [Licence MIT](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE).
:::

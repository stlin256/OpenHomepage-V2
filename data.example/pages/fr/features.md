---
title: "Fonctionnalités"
nav: true
order: 3
slug: "features"
date: 2026-08-29
updated: 2026-08-29
feed:
  enabled: true
toc: true
reading_progress: true
description: "Un tour complet des capacités de rendu markdown de ce site"
---

Cette page présente chaque type de contenu pris en charge par le site. La source est un simple fichier markdown (`data/pages/fr/features.md`) — ouvrez-le dans l'éditeur pour comparer.

## Texte et typographie

**Gras**, *italique*, ~~barré~~, `code inline`, et [liens avec titre](https://example.com "hover me").

> En typographie de magazine, les citations sont l'espace pour respirer.
> — un amateur de typographie

- Élément à puces A
- Élément à puces B
  - Élément imbriqué

- [x] Fait : pipeline de site statique
- [x] Fait : rendu markdown
- [ ] En cours : écrire plus de contenu

| Fonctionnalité | Syntaxe | Moteur de rendu |
|---------|--------|----------|
| Coloration de code | ` ```python ` | Shiki |
| Mathématiques | `$E=mc^2$` | KaTeX |
| Lecteur intégré | `::bilibili{}` | Directive personnalisée |

## Coloration de code

```python
import torch

def cosine_lr(step: int, total: int, base: float = 3e-4) -> float:
    """Cosine-annealed learning rate."""
    t = min(step / total, 1.0)
    return base * 0.5 * (1 + torch.cos(torch.tensor(t * 3.14159)))
```

## Mathématiques

En ligne $e^{i\pi} + 1 = 0$, et softmax en bloc :

$$
\mathrm{softmax}(z_i) = \frac{\exp(z_i)}{\sum\nolimits_{j=1}^{K} \exp(z_j)}
$$

## Figures et grilles

:::figure{src="assets/figure-1.jpg" caption="Fig. 1 : un COMAC C909 volant bas au-dessus de moi (directive figure avec largeur et légende)" width="72%"}
:::

Grille à deux colonnes (se replie en une colonne sur mobile) :

::::grid{cols=2}
:::cell
Texte à gauche. La typographie de magazine, c'est **les blancs et l'alignement**, pas la décoration.
:::
:::cell
:::figure{src="assets/figure-2.jpg" caption="Coucher de soleil sur le pont Haixin" width="100%"}
:::
:::
::::

## Lecteurs intégrés

Les lecteurs affichent directement l'iframe officielle dans un conteneur 16:9 responsive (`loading="lazy"`, pour que le premier affichage reste rapide) :

::youtube{id="aircAruvnKk" poster="assets/cover-youtube-aircaruvnkk.jpg"}

::bilibili{bvid="BV13z421U7cs" poster="assets/cover-bilibili-bv13z421u7cs.jpg" title="【官方双语】GPT是什么？直观解释Transformer | 深度学习第5章"}

Médias auto-hébergés (balises natives) :

:::video{src="assets/feature-flower.mp4" poster="assets/feature-flower-poster.jpg"}
:::

:::audio{src="assets/bgm.mp3" title="Goldberg Variations, BWV 988 · Aria"}
:::

:::audio{src="assets/bgm.mp3" cover="assets/goldberg-aria-cover.jpg" title="Bach: The Goldberg Variations, BWV 988 — Aria" description="Johann Sebastian Bach · The 1981 Recordings"}
:::

## Directives fonctionnelles

| Composant | Rôle |
|-----------|---------|
| Carte de dépôt GitHub | Carte d'un dépôt unique issue du cache épinglé |
| Bloc de streaming | Sortie LLM en streaming avec relecture |
| Bloc éditorial | Actions, cartes liste, tuiles, cartes archive et séparateurs |

**Carte de dépôt GitHub** :

::ghcard{repo="ggml-org/llama.cpp"}

**Bloc de streaming** :

::stream{id="welcome"}

## Composants éditoriaux

Le kit complet ci-dessous est intégré par `::editorial{id="features"}` depuis `editorial_blocks` dans `site.yaml`. Il couvre les actions, les cartes liste numérotées, les tuiles, les cartes archive et un séparateur :

::editorial{id="features"}

La carte de contact, la modale QR, le thème clair/sombre, le sélecteur de langue, la musique de fond, la lightbox d'images et la révélation au défilement sont des composants globaux ; interagissez avec cette page pour les voir.

| Composant global | Point d'entrée |
|------------------|-------------|
| Carte de contact / modale QR | Carte en bas à droite ; cliquez pour ouvrir la modale QR |
| Bascule de thème | Bouton soleil / lune en haut à droite |
| Sélecteur de langue | Bouton de langue en haut à droite |
| Bascule BGM | Bouton lecture / pause en haut à droite |
| Lightbox | Cliquez sur une image dans le corps |
| Révélation au défilement | Les blocs apparaissent au fil du défilement |

Les blocs Profil, GitHub et RSS propres à la page d'accueil sont également rendus intégralement ci-dessous ; ils ne dépendent pas de la mise en page de l'accueil.

## Profile Block · Profil

<div data-feature-slot="profile"></div>

## GitHub Block · Heatmap et dépôts

<div data-feature-slot="github"></div>

## RSS Block · Flux de cartes RSS

<div data-feature-slot="rss"></div>

## Contrôles de page

Les contrôles de page sont des widgets de niveau page configurés page par page (non globaux). Chaque page peut les définir indépendamment dans son frontmatter ; ils réapparaissent à chaque ouverture ou nouvelle visite de la page, offrant des annonces et des contrôles propres à la page.

| Contrôle de page | Configuration | Description |
|--------------|---------------|-------------|
| Bannière d'avis | Définir `notice: "..."` ou `notice: { text: "...", color: "yellow" }` dans le frontmatter | Apparaît 0,5 s après le chargement ; prend en charge 4 modes de couleur (`accent`, `yellow`, `red`, `custom`) ; propre à la page et réapparaît à chaque visite ; fermée manuellement en cliquant sur ✕ ; prend en charge liens et formatage en ligne |
| Sommaire (TOC) | Définir `toc: true` dans le frontmatter | Barre latérale sticky sur ordinateur avec suivi ScrollSpy du titre actif, tiroir repliable sur mobile |
| Barre de progression de lecture | Définir `reading_progress: true` dans le frontmatter | Fine barre de progression de 2 px fixée en haut de page qui suit la lecture en temps réel lors du défilement ; activée par défaut sur cette page de démonstration |

> 💡 Exemple : la [page d'accueil](/) de ce site présente une bannière d'avis jaune bien visible (`notice: { text: "Ceci est une page de démonstration. Le contenu sert uniquement à présenter les fonctionnalités du projet.", color: "yellow" }`) qui apparaît 0,5 s après le chargement.

## HTML brut mélangé

<mark>Cette ligne utilise la balise HTML native mark</mark>. Les balises dangereuses comme `<script>` sont filtrées par une liste blanche.


## Callouts & timeline

Les directives de contenu P0 n’ajoutent aucun script au chargement : les callouts expliquent ou alertent, la timeline présente parcours et étapes clés.

:::note{title="Entrée reproductible"}
Articles, outils et expériences restent dans un même index.
:::

:::tip{title="Limite de performance"}
Les nouvelles directives sont rendues à la construction, sans JavaScript initial supplémentaire.
:::

:::warning{title="Conclusions prudentes"}
Un score unique ne remplace pas un rapport de distribution.
:::

:::quote{title="Field Note" source="Zhiyuan Lin, 2026"}
La valeur d’une optimisation vient de mesures reproductibles.
:::

::::timeline{title="Education & Experience"}
:::timeline-item{start="2022" end="2026" title="PhD Candidate" org="Example University" url="/research" highlight="true"}
Machine learning et systèmes : ordonnancement d’inférence et évaluation reproductible.
:::
:::timeline-item{start="2026" title="Research Intern" org="Example Lab"}
Expériences d’inférence LLM sur appareils embarqués.
:::
::::

## Publications et notes bibliographiques

`data/publications.yaml` est la source canonique ; `publications.bib` fournit le BibTeX brut par clé. Le filtrage, le tri et le regroupement sont réalisés à la construction.

::publications{tag="systems" limit="3" group="year" sort="date-desc"}

Ce site prend en charge les citations scientifiques et les **notes de bas de page interactives riches**[^fn-academic]. Sur ordinateur, le survol affiche un popover intelligent contenant métadonnées, code et équations[^fn-tech] ; sur mobile, un tiroir coulissant s'ouvre, suivi d'une annexe dédiée en fin de document[^fn-spec].

[^fn-academic]: **Vaswani et al. (2017)**. *Attention Is All You Need*. Advances in Neural Information Processing Systems (NeurIPS 2017). [arXiv:1706.03762](https://arxiv.org/abs/1706.03762)
[^fn-spec]: Extension de note GFM standard avec popovers interactifs sur bureau et tiroirs sur mobile.
[^fn-tech]: Insérez du code `O(N \log N)` et des formules mathématiques comme $L = -\sum y \log \hat{y}$ au sein des notes.


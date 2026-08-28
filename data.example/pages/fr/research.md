---
title: "Recherche"
nav: true
order: 2
slug: "research"
description: "Axes de recherche et travaux représentatifs"
---

> Les notes de recherche restent courtes : elles ne gardent que ce qui peut être reproduit et vérifié.

## Inférence efficace

Le goulot d'étranglement de l'inférence des grands modèles est la bande passante mémoire, pas la puissance de calcul brute. Je me concentre sur :

- L'optimisation côté système du **décodage spéculatif**
- La compression et la pagination des caches KV
- Le parallélisme pipeline sur une petite machine multi-GPU

Un compromis typique : doubler la taille de batch améliore le débit, mais le coût du cache KV croît rapidement. L'empreinte mémoire en $O(B \cdot L \cdot d)$ n'est pas un détail à ignorer.

## Évaluation reproductible

Les benchmarks contaminés sont un problème chronique. Je construis un pipeline d'évaluation vivant :

::::grid{cols=2}
:::cell
**Problème**

- Les benchmarks statiques fuient dans les corpus d'entraînement
- La variance d'une seule exécution est souvent rapportée comme une conclusion
:::
:::cell
**Approche**

- Générer de nouvelles questions selon un calendrier glissant
- Rapporter des distributions plutôt que des estimations ponctuelles
:::
::::

## Travaux représentatifs

::ghcard{repo="huggingface/transformers"}

Dans ce site d'exemple, la carte représente l'infrastructure sur laquelle je m'appuie chaque jour. Remplacez-la par votre propre projet.

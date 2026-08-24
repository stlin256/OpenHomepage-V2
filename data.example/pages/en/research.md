---
title: "Research"
nav: true
order: 2
slug: "research"
description: "Research directions and representative work"
---

> Research notes stay short: they keep only what can be reproduced and checked.

## Efficient inference

The bottleneck in large-model inference is memory bandwidth, not raw compute. I focus on:

- System-side optimization for **speculative decoding**
- Compression and paging for KV caches
- Pipeline parallelism across a small multi-GPU machine

One typical tradeoff: doubling batch size improves throughput, but the KV-cache cost grows quickly. The memory footprint of $O(B \cdot L \cdot d)$ is not a detail to ignore.

## Reproducible evaluation

Contaminated benchmarks are a chronic problem. I am building a living evaluation pipeline:

::::grid{cols=2}
:::cell
**Problem**

- Static benchmarks leak into training corpora
- Variance from a single run is often reported as a conclusion
:::
:::cell
**Approach**

- Generate fresh questions on a rolling schedule
- Report distributions rather than point estimates
:::
::::

## Representative work

::ghcard{repo="huggingface/transformers"}

In this example site, the card represents infrastructure I rely on every day. Replace it with your own project.

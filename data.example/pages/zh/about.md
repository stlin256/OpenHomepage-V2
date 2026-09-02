---
title: "关于"
nav: true
order: 5
slug: "about"
description: "关于 OpenHomepage V2：极简、杂志风、学术级个人主页生成器"
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

## 项目愿景

**OpenHomepage V2** 是一套面向学者、工程师与创作者的静态杂志风个人主页生成器。基于 Astro 与 TypeScript 构建，所有内容与排版由本地纯文本 Markdown 和 YAML 数据驱动。

:::note{title="设计哲学"}
学术表达需要克制与严谨，杂志版式赋予呼吸感与阅读愉悦。我们摒弃繁复笨重的内容管理系统，回归纯静态交付与本地数据主权。
:::

## 核心设计特性

::::grid{cols=2}
:::cell
### 🎨 杂志排版与不对称网格
- **12 列不对称网格**：桌面端宽窄对比留白，移动端自动优雅塌缩为单列。
- **无闪烁明暗双主题**：精准跟随系统偏好或手动切换，CSS 变量瞬间平滑过渡。
- **纯 CSS 微交互**：极低运行时开销，严格遵循 `prefers-reduced-motion` 无障碍规范。
:::
:::cell
### 📝 学术文献与富媒体管线
- **学术成果检索与引用**：多维筛选、自动分组、一键复制 BibTeX。
- **富媒体交互脚注**：桌面端悬停气泡与移动端抽屉平滑展开。
- **严谨学术排版**：KaTeX 实时公式、Shiki 明暗双色代码高亮与里程碑时间线。
:::
::::

::::grid{cols=2}
:::cell
### ⚡ 极致性能与预取流水线
- **全自动自适应图片派生**：构建期自动生成现代 WebP / AVIF 多倍率响应式图像。
- **闲时智能预取**：Tab 切换与多语言路由毫秒级即时呈现。
- **零水合开销**：绝大部分页面组件零客户端 JS，首屏极速秒开。
:::
:::cell
### 🛡️ 数据隐私隔离与持续交付
- **本地数据主权**：`data/` 目录严格 `.gitignore` 隔离，源码公开而个人隐私安全无忧。
- **快照容灾机制**：CI 自动拉取私有数据源，异常时自动平滑回退最新快照。
- **全格式 Feed 聚合**：原生生成 RSS 2.0、Atom 1.0 与 JSON Feed 1.1。
:::
::::

## 开源生态与快速上手

::ghcard{repo="stlin256/OpenHomepage-V2"}

```bash
# 克隆仓库并安装依赖
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2
npm install

# 初始化本地数据目录
npm run setup

# 启动本地开发预览
npm run dev
```

:::tip{title="协议与开源"}
OpenHomepage V2 遵循 [MIT 开源许可证](https://github.com/stlin256/OpenHomepage-V2/blob/master/LICENSE)。欢迎在 GitHub 提交 Issue 与 Pull Request 共同完善！
:::

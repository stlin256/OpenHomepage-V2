<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-banner-dark.webp">
    <img alt="OpenHomepage V2" src="docs/images/logo-banner.webp" width="360">
  </picture>
</p>

<p align="center">
  <strong>Scholarly Restraint Meets Editorial Elegance.</strong><br>
  专为学者、工程师与创作者打造的杂志级排版纯静态个人主页生成器
</p>

<p align="center">
  <a href="https://stlin256.github.io/OpenHomepage-V2/"><img src="https://img.shields.io/badge/Live%20Demo-在线演示-0969DA?style=flat-square&logo=githubpages&logoColor=white" alt="Live Demo"></a>
  <a href="https://github.com/stlin256/OpenHomepage-V2/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/stlin256/OpenHomepage-V2/deploy.yml?branch=master&label=Deploy&style=flat-square&logo=githubactions&logoColor=white" alt="Deploy"></a>
  <a href="https://astro.build"><img src="https://img.shields.io/badge/Astro-5.x-BC52EE?style=flat-square&logo=astro&logoColor=white" alt="Astro"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://vitest.dev/"><img src="https://img.shields.io/badge/Tested%20with-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-informational?style=flat-square" alt="License"></a>
  <a href="https://deepwiki.com/stlin256/OpenHomepage-V2"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

<p align="center">
  <a href="https://github.com/stlin256/OpenHomepage-V2/generate"><img src="https://img.shields.io/badge/Use%20this%20template-2EA44F?style=flat-square&logo=github&logoColor=white" alt="Use this template"></a>
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fstlin256%2FOpenHomepage-V2"><img src="https://vercel.com/button" alt="Deploy with Vercel"></a>
  <a href="https://app.netlify.com/start/deploy?repository=https://github.com/stlin256/OpenHomepage-V2"><img src="https://www.netlify.com/img/deploy/button.svg" alt="Deploy to Netlify"></a>
  <a href="https://codespaces.new/stlin256/OpenHomepage-V2"><img src="https://img.shields.io/badge/Open%20in-GitHub%20Codespaces-24292F?style=flat-square&logo=github&logoColor=white" alt="Open in GitHub Codespaces"></a>
  <a href="https://stackblitz.com/github/stlin256/OpenHomepage-V2"><img src="https://img.shields.io/badge/Open%20in-StackBlitz-1269D3?style=flat-square&logo=stackblitz&logoColor=white" alt="Open in StackBlitz"></a>
</p>

<p align="center">
  <a href="#-核心特性">⚡ 核心特性</a> ·
  <a href="#-组件画廊">🎨 组件画廊</a> ·
  <a href="#-markdown-指令速查表">📝 指令速查</a> ·
  <a href="#-快速上手">🚀 快速上手</a> ·
  <a href="#-本地可视化编辑器">🎛️ 本地后台</a> ·
  <a href="#-部署与持续集成">🌐 部署上线</a> ·
  <a href="README.md">English</a>
</p>

---

**OpenHomepage V2** 是一款基于 Astro 构建的轻量级、杂志化排版纯静态个人主页生成器。全站采用科研主页式的严谨克制与现代杂志版式设计，内容与配置完全由本地 `data/` 目录中的 Markdown 与 YAML 文件驱动，并通过 GitHub Actions 自动化构建部署至 GitHub Pages。

> [!TIP]
> **开箱即用体验**：仓库内置了完整的四语示例数据（`data.example/`），克隆项目后无需任何配置即可一键启动本地预览与完整构建。`npm run setup` 提供**交互式初始化向导**（快速个性化配置 / 完整示例 / 纯净空白三种模式），`npm run doctor` 可对环境、配置与素材引用进行一体化健康自检。

---

## 目录

- [⚡ 核心特性](#-核心特性)
- [🎨 组件画廊](#-组件画廊)
  - [1. 主页与动态数据区块](#1-主页与动态数据区块)
  - [2. 学术科研与 Markdown 指令排版](#2-学术科研与-markdown-指令排版)
  - [3. 全局交互、媒体与多语言体系](#3-全局交互媒体与多语言体系)
- [📝 Markdown 指令速查表](#-markdown-指令速查表)
- [🚀 快速上手](#-快速上手)
- [💻 常用 CLI 命令](#-常用-cli-命令)
- [🎛️ 本地可视化编辑器](#️-本地可视化编辑器)
- [🌐 部署与持续集成](#-部署与持续集成)
- [📁 项目工程结构](#-项目工程结构)
- [📄 开源协议与致谢](#-开源协议与致谢)

---

## ⚡ 核心特性

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🎨 杂志美学与自适应排版</h3>
      <ul>
        <li><strong>非对称 12 列杂志网格</strong>：严谨克制的留白与现代杂志版式，手机端自动平滑塌缩为单栏。</li>
        <li><strong>首帧零闪烁明暗主题</strong>：默认跟随系统偏好，支持手动切换与会话记忆，支持自定义主题强调色。</li>
        <li><strong>微交互与硬件加速动效</strong>：基于 Transform / Opacity 的轻量平滑过渡，严格遵守 <code>prefers-reduced-motion</code>。</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>📝 学术科研与富媒体套件</h3>
      <ul>
        <li><strong>学术出版物列表（<code>::publications</code>）</strong>：多维过滤、分类排序、一键复制 BibTeX 与平滑展开摘要。</li>
        <li><strong>富媒体交互脚注（<code>[^1]</code>）</strong>：桌面端智能气泡浮窗（防视口溢出）、移动端底部抽屉与平滑回跳。</li>
        <li><strong>学术与工程排版</strong>：KaTeX 原生数学公式、Shiki 明暗双主题代码高亮、经历时间线与杂志风语义注记框。</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>⚡ 极致性能与预加载管线</h3>
      <ul>
        <li><strong>全自动 WebP / AVIF 响应式衍生</strong>：按布局断点生成 1x / 2x / 3x 候选图，<code>&lt;picture&gt;</code> 优先加载高压缩比 AVIF。</li>
        <li><strong>激进空闲预取与共享内存缓存</strong>：页面就绪后空闲预取多语言与 Tab 页面，语言切换近乎瞬时。</li>
        <li><strong>Speculation Rules 预热</strong>：Chromium 内核悬停预取，配合纯静态直出实现秒开体验。</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🎛️ 本地可视化直编编辑器</h3>
      <ul>
        <li><strong>真实渲染页所见即所得直编</strong>：悬停描边、就地文本编辑、指令参数检查器、区块拖拽与插入、撤销/重做（<code>Ctrl+Z</code>）。</li>
        <li><strong>全站配置表单与源码兜底</strong>：站点配置、主题取色、Favicon 自动生成及整页 Markdown 源码编辑。</li>
        <li><strong>版本快照与一键导出</strong>：停顿自动写盘、<code>.snapshots/</code> 历史备份回滚、一键导出 <code>data.zip</code>。</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🌐 零开销多语言架构</h3>
      <ul>
        <li><strong>目录即路由</strong>：在 <code>data/pages/&lt;lang&gt;/</code> 增设语言目录即可自动激活路由、导航与多语言配置。</li>
        <li><strong>智能回退链机制</strong>：缺译页面静默兜底回退；内置中文、English、日本語、Français 四语完整演示。</li>
        <li><strong>全局多语言搜索</strong>：<code>Ctrl+K</code> 快速呼出毛玻璃搜索框，支持中英文分词与多语言作用域即时切换。</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3>🛡️ 隐私优先与无头 CI/CD</h3>
      <ul>
        <li><strong>数据隐私彻底解耦</strong>：真实 <code>data/</code> 目录不入版本库，代码开源而个人数据私有安全。</li>
        <li><strong>容灾快照回退</strong>：GitHub Actions 支持私有直链拉取，数据源失效时自动拉取上一成功快照平滑兜底。</li>
        <li><strong>原创全站 Feed 生成</strong>：构建期自动生成 RSS 2.0（<code>/feed.xml</code>）、Atom 1.0 与 JSON Feed 1.1。</li>
      </ul>
    </td>
  </tr>
</table>

---

## 🎨 组件画廊

以下全部组件截图均由 Playwright 从生产构建环境一键截取生成（`npm run screenshots`）——**所见即所得**。

### 1. 主页与动态数据区块

<table>
  <tr>
    <td width="50%" align="center">
      <b>个人名片（ProfileBlock · 明色）</b><br>
      <sub>头像自适应取色、姓名简介与社交/学术链接行</sub><br><br>
      <img src="docs/images/components/profile-zh.webp" alt="个人名片（明色）">
    </td>
    <td width="50%" align="center">
      <b>个人名片（ProfileBlock · 暗色）</b><br>
      <sub>深色暖黑背景、对比度自适应强调色与无缝切换</sub><br><br>
      <img src="docs/images/components/profile-dark-zh.webp" alt="个人名片（暗色）">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>LLM 打字机流式区块 (<kbd>::stream</kbd>)</b><br>
      <sub>拟真大模型打字机呈现预写 Markdown，支持重播与速度配置</sub><br><br>
      <img src="docs/images/components/stream-zh.webp" alt="LLM 流式区块">
    </td>
    <td width="50%" align="center">
      <b>GitHub 贡献热力图</b><br>
      <sub>构建期 GraphQL 预取日历，5 档主题色阶与逐日提示气泡</sub><br><br>
      <img src="docs/images/components/github-heatmap-zh.webp" alt="GitHub 贡献热力图">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>Pinned 仓库卡片</b><br>
      <sub>1:1 还原 GitHub 官网质感：语言色点、Star/Fork 与相对时间</sub><br><br>
      <img src="docs/images/components/github-repos-zh.webp" alt="Pinned 仓库卡片">
    </td>
    <td width="50%" align="center">
      <b>多源 RSS 文章卡片流 (RssBlock)</b><br>
      <sub>支持最新发布（latest）与精选置顶（curated），封面懒加载</sub><br><br>
      <img src="docs/images/components/rss-zh.webp" alt="RSS 文章卡片流">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>编辑风展示区块：按钮组与列表卡 (<kbd>::editorial</kbd>)</b><br>
      <sub>动作按钮组与带序号列表卡，由 <code>site.yaml</code> 自由组合</sub><br><br>
      <img src="docs/images/components/editorial-list-zh.webp" alt="编辑风展示区块：列表卡">
    </td>
    <td width="50%" align="center">
      <b>编辑风展示区块：磁贴与归档卡 (<kbd>::editorial</kbd>)</b><br>
      <sub>图片磁贴、归档卡片与分割线的杂志化编排</sub><br><br>
      <img src="docs/images/components/editorial-tiles-zh.webp" alt="编辑风展示区块：磁贴与归档卡">
    </td>
  </tr>
</table>

### 2. 学术科研与 Markdown 指令排版

<table>
  <tr>
    <td width="50%" align="center">
      <b>学术成果列表 (<kbd>::publications</kbd>)</b><br>
      <sub>构建期多维过滤分组，支持一键复制 BibTeX 与平滑展开摘要</sub><br><br>
      <img src="docs/images/components/publications-zh.webp" alt="学术成果列表">
    </td>
    <td width="50%" align="center">
      <b>富媒体交互脚注 (<kbd>[^1]</kbd>)</b><br>
      <sub>桌面端悬停智能气泡，移动端平滑滑出底部抽屉与精准回跳</sub><br><br>
      <img src="docs/images/components/footnote-zh.webp" alt="富媒体交互脚注">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>经历与里程碑时间线 (<kbd>::::timeline</kbd>)</b><br>
      <sub>极简杂志风履历时间轴，带状态节点指示与自适应响应式布局</sub><br><br>
      <img src="docs/images/components/timeline-zh.webp" alt="经历与里程碑时间线">
    </td>
    <td width="50%" align="center">
      <b>杂志风注记卡片 (<kbd>:::note</kbd> / <kbd>:::tip</kbd> 等)</b><br>
      <sub>零 JS 语义化注记框，自动匹配主题强调色与自适应明暗背景</sub><br><br>
      <img src="docs/images/components/markdown-callout-zh.webp" alt="杂志风注记卡片">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>KaTeX 数学公式</b><br>
      <sub>行内 <code>$...$</code> 与块级公式原生极速静态排版渲染</sub><br><br>
      <img src="docs/images/components/markdown-math-zh.webp" alt="KaTeX 数学公式">
    </td>
    <td width="50%" align="center">
      <b>Shiki 明暗双主题代码高亮</b><br>
      <sub>Shiki 引擎内联样式，随全站主题无闪烁平滑同步</sub><br><br>
      <img src="docs/images/components/markdown-code-zh.webp" alt="Shiki 代码高亮">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>结构化配图与图注 (<kbd>:::figure</kbd>)</b><br>
      <sub>支持显式宽度约束、多对齐方式与美观杂志风图注</sub><br><br>
      <img src="docs/images/components/markdown-figure-zh.webp" alt="结构化配图指令">
    </td>
    <td width="50%" align="center">
      <b>12 列杂志化网格 (<kbd>::::grid</kbd>)</b><br>
      <sub>非对称多栏版式排版容器，移动端自动优雅塌缩为单栏</sub><br><br>
      <img src="docs/images/components/markdown-grid-zh.webp" alt="网格指令">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>自渲染音频播放器 (<kbd>:::audio</kbd>)</b><br>
      <sub>自研轻量播放器（双模式），带文字跑马灯与 BGM 智能互斥续播</sub><br><br>
      <img src="docs/images/components/media-audio-zh.webp" alt="自渲染音频播放器">
    </td>
    <td width="50%" align="center">
      <b>响应式视频嵌入 (<kbd>::bilibili</kbd> / <kbd>::youtube</kbd>)</b><br>
      <sub>16:9 官方质感门面卡片，封面标题自动解析，点击后才拉取 iframe</sub><br><br>
      <img src="docs/images/components/media-video-zh.webp" alt="响应式视频卡片">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>GitHub 内嵌仓库卡 (<kbd>::ghcard</kbd>)</b><br>
      <sub>在 Markdown 正文任意位置嵌入 1:1 质感 GitHub 仓库卡</sub><br><br>
      <img src="docs/images/components/ghcard-zh.webp" alt="GitHub 仓库卡">
    </td>
    <td width="50%" align="center">
      <b>长文目录与阅读进度条 (<kbd>toc: true</kbd>)</b><br>
      <sub>桌面端粘性吸顶侧边栏、移动端折叠抽屉导航与顶部 2px 细线进度条</sub><br><br>
      <img src="docs/images/components/toc-sidebar-zh.webp" alt="目录侧边栏与进度条">
    </td>
  </tr>
</table>

### 3. 全局交互、媒体与多语言体系

<table>
  <tr>
    <td width="50%" align="center">
      <b>全局静态搜索 (<kbd>Ctrl+K</kbd> / <kbd>Cmd+K</kbd>)</b><br>
      <sub>支持多语言作用域切换（当前/全部）、中英文分词与键盘极速导航</sub><br><br>
      <img src="docs/images/components/search-dialog-zh.webp" alt="全局静态搜索弹窗">
    </td>
    <td width="50%" align="center">
      <b>BGM 播放列表与抽屉迷你播放器</b><br>
      <sub>多曲目播放列表抽屉、曲目切换、音量记忆与媒体冲突智能续播</sub><br><br>
      <img src="docs/images/components/bgm-drawer-zh.webp" alt="BGM 播放列表抽屉">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>多语言无缝切换器</b><br>
      <sub>目录分语系，内置中 / 英 / 日 / 法四语演示，缺译页面静默回退</sub><br><br>
      <img src="docs/images/components/lang-switcher-zh.webp" alt="语言切换器">
    </td>
    <td width="50%" align="center">
      <b>顶栏工具区</b><br>
      <sub>背景音乐开关、语言菜单、全局搜索与首帧防闪烁主题切换</sub><br><br>
      <img src="docs/images/components/header-tools-zh.webp" alt="顶栏工具区">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>画廊相册网格</b><br>
      <sub>带图注的响应式网格相册，点击任意图片自动开启全屏灯箱</sub><br><br>
      <img src="docs/images/components/gallery-grid-zh.webp" alt="画廊网格">
    </td>
    <td width="50%" align="center">
      <b>全屏高清图片灯箱</b><br>
      <sub>支持自动匹配 <code>-full</code> 高清原图、平滑缩放过渡与键盘 Esc 关闭</sub><br><br>
      <img src="docs/images/components/lightbox-zh.webp" alt="图片灯箱">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <b>浮动联系微卡片 (ContactCard)</b><br>
      <sub>右下角延迟滑入的精致联系卡，点击快速呼出全屏二维码弹窗</sub><br><br>
      <img src="docs/images/components/contact-card-zh.webp" alt="联系微卡片">
    </td>
    <td width="50%" align="center">
      <b>全屏二维码弹窗 (QR Modal)</b><br>
      <sub>全屏毛玻璃背景二维码弹窗，支持移动端扫码快速触达与微信赞赏</sub><br><br>
      <img src="docs/images/components/qr-modal-zh.webp" alt="二维码弹窗">
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <b>页面通知横幅 (NoticeBanner)</b><br>
      <sub>单页 Frontmatter 独立配置的顶端公告横幅，支持主题色 / 黄 / 红 / 自定义色</sub><br><br>
      <img src="docs/images/components/notice-banner-zh.webp" alt="通知横幅">
    </td>
  </tr>
</table>

---


## 📝 Markdown 指令速查表

在任何 `.md` 页面中，你可以直接使用以下拓展指令，享受杂志级的排版表达力：

| 指令语法 | 渲染类型 | 核心参数与说明 | 适用场景 |
|---|---|---|---|
| `::publications{category="journal"}` | 块级 | 自动读取 `data/publications.yaml`，多维过滤/分组，支持 BibTeX 复制 | 学术论文、预印本、期刊成果列表 |
| `[^1]` 与 `[^1]: 解释` | 行内/文末 | 桌面端智能气泡浮窗（防视口溢出）、移动端底部抽屉与双向平滑回跳 | 学术引用、术语注解、DOI 链接 |
| `::::timeline` / `:::timeline-item` | 容器 | 杂志风经历时间轴，支持 `date`、`title`、`org`、`description` 属性 | 教育背景、工作履历、学术里程碑 |
| `:::note` / `:::tip` / `:::warning` / `:::important` / `:::quote` | 容器 | 零 JS 杂志风语义注记框，自动匹配站点明暗背景与强调色 | 重点提示、引用格言、技术注意事项 |
| `::stream{id="welcome" replay="true"}` | 块级 | 拟真大模型打字机流式呈现预写 Markdown，支持重播与速度配置 | 动态自我介绍、主页开篇陈词 |
| `::::grid{cols=2}` / `:::cell` | 容器 | 12 列非对称杂志网格排版容器，移动端自动优雅塌缩为单栏 | 图文混排、多列卡片式布局 |
| `:::figure{src="..." caption="..." width="70%" align="center"}` | 容器 | 结构化配图指令，支持宽度约束（`%/px/vw`）、对齐与美观图注 | 实验图表、设计稿、论文插图 |
| `:::audio{src="..." title="..." cover="..." mode="card"}` | 容器 | 自渲染轻量音频播放器，带标题跑马灯，与站内 BGM 智能互斥续播 | 音乐试听、播客音频、语音讲解 |
| `::bilibili{bvid="..."}` / `::youtube{id="..."}` | 块级 | 16:9 响应式门面卡片，封面标题自动解析，用户点击后才拉取 iframe | 视频嵌入、保护首屏加载速度 |
| `:::video{src="..." poster="..."}` | 容器 | 原生 HTML5 响应式视频卡片，带自定义封面图与控制条 | 本地或自托管短视频展示 |
| `::ghcard{repo="owner/repo"}` | 块级 | 在 Markdown 正文中任意嵌入 1:1 质感的 GitHub 仓库卡片 | 开源项目推荐、工具库展示 |
| `::editorial{id="features"}` | 块级 | 嵌入 `site.yaml` 定义的编辑风区块（按钮组/列表/磁贴/归档卡） | 主页功能矩阵、精选模块展示 |

---

## 🚀 快速上手

### 环境要求
- **Node.js**：`>= 18.17.0`（推荐 Node 24+）
- **包管理器**：`npm` / `pnpm` / `yarn`

### 4 步极速运行

```bash
# 1. 克隆项目仓库
git clone https://github.com/stlin256/OpenHomepage-V2.git
cd OpenHomepage-V2

# 2. 安装项目依赖
npm install

# 3. 运行交互式初始化向导
#    （快速个性化配置 / 完整示例 / 纯净空白三种模式）
npm run setup

# 4. 启动本地开发预览
npm run dev
```

浏览器访问 `http://localhost:4321` 即可预览站点！

初始化向导提供三种模式：

- **⚡ 快速向导**：输入姓名、一句话简介与 GitHub 用户名，选择语言体系（单语 / 中英双语 / 四语）与功能模块，生成干净的个人专属 `data/` 目录。
- **📦 完整示例**：复制 `data.example/` 全量四语演示站（CI 等非交互环境下自动回退为该模式）。
- **📄 纯净空白**：仅生成最小单语言骨架，适合从零开始折腾。

> [!NOTE]
> 若尚未运行 `npm run setup`，系统会自动使用 `data.example/` 目录进行演示构建与预览，完全无需担心缺少配置文件。若 `data/` 已存在，向导会自动跳过，绝不覆盖你的真实数据。

---

## 💻 常用 CLI 命令

| 命令 | 描述说明 | 默认访问地址 | 运行生命周期 |
|---|---|---|---|
| `npm run setup` | **交互式初始化向导**（快速配置 / 完整示例 / 纯净空白），非交互环境自动回退为复制示例数据 | — | 运行完成自动退出 |
| `npm run doctor` | **一体化健康自检**：环境、配置、语言目录、素材引用、指令语法、端口占用；`--online` 追加 GitHub/RSS 连通性检查 | — | 运行完成自动退出（致命错误退出码为 `1`） |
| `npm run admin` | **启动本地可视化编辑器**（自动托管站点实时预览服务） | `http://127.0.0.1:4174` | 终端按 `Ctrl+C` 统一停止 |
| `npm run dev` | 仅启动 Astro 开发服务器（支持 Vite 模块热更新 HMR） | `http://localhost:4321` | 终端按 `Ctrl+C` 停止 |
| `npm run build` | **执行正式静态构建**，自动生成多档 WebP + AVIF 响应式图片 | — | 运行完成自动退出 |
| `npm run preview` | 本地预览 `dist/` 生产构建输出产物 | `http://localhost:4321` | 终端按 `Ctrl+C` 停止 |
| `npm run serve` | **独立生产级静态托管服务**（支持自定义端口与 HTTPS） | `http://localhost:8080` | 终端按 `Ctrl+C` 停止 |
| `npm test` | 运行 Vitest 单元测试与集成测试套件 | — | 运行完成自动退出 |
| `npm run prefetch` | 预取远端 GitHub 贡献图、Pinned 仓库与 RSS 数据至 `.cache/` | — | 运行完成自动退出 |
| `npm run screenshots` | 从 `dist/` 自动重构生成 README 全部组件截图（基于 Playwright） | — | 运行完成自动退出 |

---

## 🎛️ 本地可视化编辑器

在 PC 本地终端运行以下命令，即可打开专属可视化管理后台：

```bash
npm run admin       # 浏览器访问 http://127.0.0.1:4174（仅监听本地安全回环地址）
```

- **新手欢迎向导**：首次以全新数据启动后台时自动弹出三步配置卡片（个人名片 → 模块编排 → 主题色盘），也可随时点击顶栏「🚀 新手向导」重新打开。
- **真实渲染页直编（WYSIWYG on Real Render）**：后台点击「可视化编辑」，直接在真实排版页面上进行修改——鼠标悬停描边、文本块就地编辑、指令右侧参数检查器、区块一键插入与拖拽排序、`Ctrl+Z` 撤销/重做、流式打字机内容弹窗即时预览。
- **全站可视化配置表单**：支持配置站点信息、社交链接、头像智能取色与强调色自定义、Favicon 一键生成、背景音乐与播放列表管理、GitHub/RSS 订阅源设置及首页区块拖拽重排。
- **BibTeX 一键导入**：在「配置 → 学术成果」中粘贴 BibTeX 文本或选择 `.bib` 文件，自动解析、按 DOI/标题去重、预览确认后合并进 `publications.yaml`，全程自动留快照。
- **源码兜底编辑**：保留 Frontmatter 结构化表单与整页 Markdown 源码编辑器，编辑停顿约 1.5 秒自动写盘。
- **自动保存与版本快照（Snapshots）**：每次保存前自动将历史备份至 `data/.snapshots/`，支持版本对比与一键回滚。
- **数据双向导出与导入**：顶栏一键导出打包为 `data.zip`，也可随时导入 `data.zip` 完成迁移——解压前自动备份当前数据，并严格拦截路径穿越，跨电脑迁移零负担。

---

## 🌐 部署与持续集成

项目内置了完整的 GitHub Actions 自动化工作流（`.github/workflows/deploy.yml`）。代码推送到 `main` 分支或每 8 小时定时触发构建，自动发布至 GitHub Pages。

### GitHub Secrets 环境变量配置

| Secret 变量名 | 必填性 | 说明与作用 |
|---|---|---|
| `ENABLE_EXAMPLE` | 可选 | 设为 `true` 时启用示例模式，直接使用内置 `data.example/` 部署完整演示站 |
| `DATA_SOURCE_URL` | 私有部署必填 | 存放私有 `data.zip` 压缩包的直接下载直链（支持预签名 URL） |
| `GH_PAT` | 可选 | 具备 `read:user` 权限的 GitHub Token，用于拉取完整的 GraphQL 贡献日历数据 |

> 💡 `GH_PAT` 可在 [github.com/settings/tokens](https://github.com/settings/tokens) 生成（scope 勾选 `read:user`）；后台顶栏的「🚀 部署到线上」引导会逐步带你完成 Secrets 配置。

### 容灾降级与邮件告警机制
- **容灾快照恢复**：若配置的 `DATA_SOURCE_URL` 下载失败，CI 会自动拉取上一次成功构建的快照包（`data-snapshot.zip`）继续构建，刷新动态 GitHub/RSS 数据后完成发布，确保线上站点绝不宕机。
- **邮件提醒触发**：快照恢复执行后，工作流会以告警状态结束，利用 GitHub 原生机制向维护者发送邮件提醒。

> [!NOTE]
> **隐私设计**：以下所有平台默认使用仓库内置的 `data.example/` 示例数据构建。私有 `data/` 目录已被 git 忽略，并通过 `.dockerignore` 排除在镜像之外；如需部署真实内容，请使用 `DATA_SOURCE_URL` 机制（GitHub Actions Secret 或 Docker 构建参数），或直接 Fork 为私有仓库。

### Vercel

点击上方的 **Deploy with Vercel** 按钮，或在 Vercel 控制台手动导入仓库。仓库内置 `vercel.json` 已锁定全部配置：

- **Build Command**：`npm run build` · **Output Directory**：`dist` · **Install Command**：`npm ci`
- Node.js 版本在项目中设置（Vercel 控制台 → *Settings → General → Node.js Version*；推荐 24.x，任意 `>= 18.17` 均可）。

### Netlify

点击上方的 **Deploy to Netlify** 按钮，或手动添加站点。`netlify.toml` 已声明：

- **Build Command**：`npm run build` · **Publish Directory**：`dist` · **Node 版本**：`24`
- 已通过 `[[headers]]` 预配置 Astro 哈希产物 `/_astro/*` 的长期 immutable 缓存。

### Cloudflare Pages

无需配置文件，在 Pages 项目控制台设置：

- **Build Command**：`npm run build` · **Build Output Directory**：`dist`
- **环境变量**：`NODE_VERSION = 24`（任意 `>= 18.17` 均可）

### Docker

构建并运行自包含镜像（构建阶段 `node:24-slim`，运行阶段 `nginx:alpine`，静态缓存策略见 `deploy/nginx.conf`）：

```bash
# 演示站（使用内置 data.example/ 构建）
docker build -t openhomepage-v2 .
docker run -d -p 8080:80 openhomepage-v2

# 构建时注入私有数据
docker build --build-arg DATA_SOURCE_URL="https://example.com/data.zip" -t openhomepage-v2 .
```

访问 `http://localhost:8080`。细节见 `docs/specs/17-deployment.md`。

### Docker Compose

```bash
docker compose up --build -d     # 访问 http://localhost:8080
```

### GitHub Codespaces / Dev Container

`.devcontainer/devcontainer.json` 提供了开箱即用的 Node 24 环境。在 GitHub 网页端 *Code → Codespaces → Create* 打开，或在 VS Code 中使用 Dev Containers 扩展；依赖自动安装（`postCreateCommand`），端口 `4321`（开发/预览）与 `4174`（管理后台）自动转发。

---

## 📁 项目工程结构

```
OpenHomepage-V2/
├── data.example/        # 内置示例数据与媒体素材（版本库跟踪）
│   ├── site.yaml        # 全站核心配置（主题、导航、个人信息）
│   ├── publications.yaml# 学术论文与成果列表
│   ├── rss.yaml         # 多源 RSS 订阅列表
│   ├── pages/<lang>/    # 多语言 Markdown 页面正文
│   └── streaming/       # 流式打字机预写内容
├── data/                # 用户真实内容与配置（不入库，.gitignore 严格忽略）
├── admin/               # 本地可视化编辑器服务端与客户端源码
├── docs/                # 架构设计、指令规范与测试文档
│   └── images/          # 品牌 Logo 与组件自动化画廊截图
├── scripts/             # 预取、图片优化、静态服务与截图脚本
├── src/                 # Astro 核心源码
│   ├── components/      # 页面区块与原子组件
│   ├── layouts/         # BaseLayout 站点外壳（导航/主题/搜索）
│   ├── lib/             # 纯函数层（Markdown/配置/路由/缓存/i18n）
│   └── styles/          # 语义化 CSS 变量、12 列网格与全局排版
└── tests/               # Vitest 单元与集成自动化测试套件
```

---

## 📄 开源协议与致谢

本项目基于 [MIT License](LICENSE) 协议开源。欢迎 Star、Fork 或提交 Issue 与 Pull Request 共同完善！

<p align="center">
  <a href="https://stlin256.github.io/OpenHomepage-V2/">✨ 访问在线演示</a> ·
  <a href="https://github.com/stlin256/OpenHomepage-V2/issues">🐛 提交反馈 / Issues</a> ·
  <a href="https://github.com/stlin256/OpenHomepage-V2">⭐ Star 本项目</a>
</p>
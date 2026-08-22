# 可视化编辑器信息架构（细化项 #6）

> 状态：待讨论确认。形态已定：`npm run admin` 本地 Web 服务，仅 PC，WYSIWYG（Milkdown），读写本地 data/。

## 1. 界面布局

```
┌────────────────────────────────────────────────┐
│ 顶栏: Logo  [保存]  [预览站点]  状态提示        │
├──────────┬─────────────────────────────────────┤
│ 侧栏      │  主编辑区                            │
│ ▸ 页面    │  （随侧栏选中项切换）                │
│   - index │                                     │
│   - 研究   │  页面 → Milkdown WYSIWYG 编辑器     │
│ ▸ 配置    │  配置 → 对应表单                    │
│   - 站点  │                                     │
│   - GitHub│                                     │
│   - RSS   │                                     │
│   - 流式块 │                                     │
│   - 主题  │                                     │
│ ▸ 素材    │  素材 → 文件管理器                  │
└──────────┴─────────────────────────────────────┘
```

## 2. 功能模块

| 模块 | 内容 | 交互 |
|------|------|------|
| 页面 | data/pages/*.md 列表，新建/重命名/删除 | Milkdown WYSIWYG；frontmatter 以表单条（标题/导航开关/排序）呈现于编辑器顶部 |
| 站点配置 | site.yaml 的 site/profile/theme 段 | 表单：文本框、链接列表编辑器、模式切换 |
| GitHub | username、贡献图开关、pinned 列表 | 表单：repo 列表支持增删、拖拽排序 |
| RSS | rss.yaml | 源列表编辑器：每个源可展开配 mode/latest/weight/cover；curated 文章子列表 |
| 流式块 | streaming_blocks + home.layout 排序 | 块定义表单 + 主页布局拖拽排序器 |
| 主题 | accent 取色器 | 头像候选色条（自动提取 4-6 色）+ 在头像上点取 + 手动色值输入 |
| 素材 | data/assets/ | 上传/删除/复制引用路径 |

## 3. 技术要点

- 服务：Node（fastify 或原生 http），端口默认 4174，仅监听 127.0.0.1。
- API：`GET/PUT /api/pages/:slug`、`GET/PUT /api/config/:name`、`POST /api/assets` 等，REST 直写文件。
- 保存：显式点"保存"按钮写盘（非自动保存），写盘前校验 YAML/schema，失败保留草稿并提示。
- 预览站点：按钮打开 `npm run dev` 的 dev server（若未启动则提示先启动）。
- Milkdown 自定义节点：与 03 文档指令一一对应（播放器/figure/grid/stream/ghcard 在编辑器里渲染为占位卡片，可编辑参数）。

## 4. 已定细节

- ✅ 新建页面向导：输入标题自动生成 slug + frontmatter 模板。
- ✅ 粘贴图片直接入 data/assets/ 并插入 markdown 引用。
- ✅ 保存策略：**自动保存**（编辑停顿 ~1.5s 后写盘）+ **版本快照**：每次写盘前把上一版备份到 `data/.snapshots/<文件>/<时间戳>`，保留最近 20 版，支持回滚。`data/.snapshots/` 随 data/ 一同不入库。

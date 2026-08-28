# GitHub Actions 工作流细节（细化项 #8）

> 状态：✅ 已实现（2026-08-23，2026-08-27 更新支持示例部署模式）——见 `.github/workflows/deploy.yml`。总体策略见 design.md 第 8 节。

## 1. 触发条件

```yaml
on:
  push:
    branches: [main, master] # 代码变更触发
  schedule:
    - cron: '30 */8 * * *'  # 每 8 小时的半点（00:30 / 08:30 / 16:30 UTC）
  workflow_dispatch:        # 手动触发
```

> **修改频率/基准时间的方法**：GitHub Actions 的 schedule 只能是 workflow 文件里的字面 cron，无法从 secret/variable 注入。要改频率或基准时间，直接编辑 `.github/workflows/deploy.yml` 中这一行 cron（编辑器可提供一个快捷入口帮你算好表达式并打开该文件）。注意 GitHub 对定时任务有排队延迟（高峰期可能晚几分钟到几十分钟），且长间隔建议 ≥ 1 小时。

## 2. Job 步骤

```yaml
steps:
  - uses: actions/checkout@v4                      # 分支代码

  - name: 拉取上次部署产物（gh-pages）
    uses: actions/checkout@v4
    with: { ref: gh-pages, path: prev }
    continue-on-error: true                        # 首次部署无 gh-pages，容忍失败

  - name: 获取 data（在线源 / 示例数据 / 快照兜底）
    id: data
    run: |
      if [ "$ENABLE_EXAMPLE" = "true" ] || [ "$ENABLE_EXAMPLE" = "1" ] || [ "$USE_EXAMPLE_DATA" = "true" ] || [ "$USE_EXAMPLE_DATA" = "1" ]; then
        echo "mode=example" >> "$GITHUB_OUTPUT"
        echo "启用示例模式：使用内置 data.example/ 数据进行正式部署"
        rm -rf data && cp -r data.example data
      elif [ -n "$DATA_SOURCE_URL" ] && curl -fsSL --max-time 120 "$DATA_SOURCE_URL" -o data.zip \
         && unzip -q -o data.zip && [ -f data/site.yaml ]; then
        echo "mode=online" >> "$GITHUB_OUTPUT"
      elif [ -f prev/data-snapshot.zip ]; then
        unzip -q -o prev/data-snapshot.zip -d .
        echo "mode=snapshot" >> "$GITHUB_OUTPUT"
        echo "::warning::在线 data 源失效，使用上次部署的快照（仅动态数据将更新）/ Online data source failed; restored from last snapshot."
      else
        echo "::error::在线 data 源失效且无历史快照/示例配置，无法构建 / Online data source failed and no snapshot/example available; build aborted."
        exit 1
      fi
    env:
      ENABLE_EXAMPLE: ${{ secrets.ENABLE_EXAMPLE }}
      USE_EXAMPLE_DATA: ${{ secrets.USE_EXAMPLE_DATA }}
      DATA_SOURCE_URL: ${{ secrets.DATA_SOURCE_URL }}

  - uses: actions/setup-node@v4
    with: { node-version: 22, cache: npm }

  - run: npm ci
  - run: npm run prefetch -- --force          # scripts/prefetch.ts（tsx 运行）
    env: { GH_PAT: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}, GH_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }} }
  - run: npm run build                             # astro build → dist/ → 普通页面图生成多档响应式 WebP + AVIF（<picture> 优先 AVIF）

  - name: 校验产物                                # dist/index.html 非空且含 <html
    run: test -s dist/index.html && grep -q "<html" dist/index.html

  - name: 打包 data 快照
    run: cd data && zip -qr ../dist/data-snapshot.zip . && cd ..

  - name: 部署到 gh-pages
    uses: peaceiris/actions-gh-pages@v4
    with: { github_token: ${{ secrets.GITHUB_TOKEN }}, publish_dir: dist }

  - name: 快照回退标记（触发邮件通知）
    if: steps.data.outputs.mode == 'snapshot'
    run: |
      # 中英双语写入 GITHUB_STEP_SUMMARY，然后 exit 1 触发 GitHub 失败邮件
      echo "## ⚠️ 使用了快照回退 / Snapshot fallback used ..." >> "$GITHUB_STEP_SUMMARY"
      exit 1
```

## 3. 要点说明

- **示例模式（Demo）**：当 GitHub Secret 设置了 `ENABLE_EXAMPLE`（或 `USE_EXAMPLE_DATA`）为 `true` 时，自动采用仓库内置 `data.example/` 目录进行正式生产构建与部署（非调试模式），且不会触发快照回退警告。
- **邮件触发**：当在线源失效且回退到上次快照时，最后一步故意 `exit 1`——部署已完成，但 workflow 标红，GitHub 自动发失败邮件；Actions 页面 summary/warning 里写明原因。
- **快照内容**：`data-snapshot.zip` 放在产物根目录，含当次完整 data/（含 `.snapshots/` 版本快照，便于线上留存历史）。
- **校验**：部署前检查 `dist/index.html` 非空且包含 `<html`（沿用旧项目做法）。
- **权限**：workflow 需 `contents: write`（推 gh-pages）；`GH_PAT` 仅用于 prefetch 的 GraphQL（缺省使用 GITHUB_TOKEN）。
- zip 下载校验：检查 `unzip` 后存在 `data/site.yaml`，否则视为源无效走快照。

## 4. 已定细节

- ✅ 定时：每 8 小时半点（`30 */8 * * *`）；改频率/基准时间 = 编辑 workflow 里的 cron 行（见上方说明）。
- ✅ 快照包含编辑器的 `.snapshots/` 版本历史，线上产物可找回误删内容。

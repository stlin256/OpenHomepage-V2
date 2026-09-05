# 20：Admin 图形化工具入口（动态数据刷新 / 健康检查 / 自动打开浏览器）（规格）

> 状态：已实现。服务端逻辑在 `admin/server/live-tools.ts` 与 `admin/server/open-browser.ts`，
> 路由注册在 `admin/server/http.ts`，前端视图 `admin/ui/views/doctor.ts` + 顶栏按钮（`admin/ui/main.ts`）。
> 全局约束：零新增 npm 依赖；网络/抓取实现全部可注入替身，测试零触网（`tests/admin-live-tools.test.ts`）。

## 1. 用户目标

- 改了 `site.yaml` 的 GitHub 用户名或 `rss.yaml` 后，不用记 `npm run prefetch`：顶栏一键刷新动态数据，并能看到上次抓取时间（避免 GitHub/RSS 区块渲染空态）。
- 不开终端也能跑健康自检：侧栏「工具 → 健康检查」内嵌 `npm run doctor` 同款检查，结构化渲染报告。
- `npm run admin` 启动后自动打开浏览器，少一步手动复制 URL。

## 2. HTTP 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/prefetch` | 调 `runPrefetch()`（`src/lib/prefetch.ts`）抓取 GitHub/RSS 写入 `.cache/`，固定 `force: true`（手动刷新忽略 TTL；内部仍有 60s 总超时兜底）。运行中重复触发 → **409**（`PrefetchBusyError` 经 `sendError` 映射）。成功 → 200 `{ ok, blocks, warnings }`；抓取实现抛错 → 500 + 友好错误 |
| GET | `/api/prefetch/status` | `{ running, lastFetchedAt }`：`lastFetchedAt` 取 `.cache/meta.json` 的 `updated_at`（真实抓取时钟），缺失时回退 `github.json`/`rss.json` 的较新 mtime，均无 → `null`（供页面加载时展示） |
| GET | `/api/doctor` | 默认离线；`?online=1`（或 `true`）追加 GitHub API / RSS 源探测。调 `runDoctor()`（`scripts/doctor-lib.ts`）→ 200 `{ online, report, summary }`（summary 为按级别计数） |

服务端注入点（`AdminServerOptions`）：`cacheDir`（缺省 `<rootDir>/.cache`）、`prefetchRun`、`doctorRun`，测试经替身覆盖真实并发守卫与状态读取，零触网。

## 3. 前端

- **顶栏「🔄 刷新动态数据」**（`admin/ui/main.ts`）：点击 → 按钮禁用 + 文案切换为抓取中（防重复，与服务端 409 双保险）→ 完成后状态栏显示结果（成功显示数据块数；有警告显示警告数；`ok=false` 或请求失败显示错误）。按钮 `title` 展示上次抓取时间（boot 与每次刷新后经 `/api/prefetch/status` 更新；从未抓取显示空态提示）。
- **侧栏「工具 → 健康检查」**（`#/doctor`，`admin/ui/views/doctor.ts`）：进入即跑离线检查；「含在线检查」勾选框切换后重新请求；「重新检查」按钮重跑。报告按 section 分组渲染，条目按级别分色徽标（ok 绿 / warn 橙 / error 红 / skip 灰，`.doctor-badge`），修复建议以 `<details>` 折叠展开；顶部汇总行（✓/!/✗/– 计数，有警告/错误时变色）。

## 4. 自动打开浏览器

- `admin/server/index.ts` 在 `server.listen` 回调内（URL 打印之后）调 `openBrowser(adminOrigin)`；`ADMIN_NO_OPEN=1` 环境变量禁用。
- 平台命令构造抽成纯函数 `buildOpenCommand(platform, url)`（`admin/server/open-browser.ts`，可单测）：Windows `cmd /c start "" <url>`（空串为 start 的窗口标题占位）、macOS `open`、其余 `xdg-open`。
- `openBrowser()` 用 `spawn(detached, stdio: 'ignore')` + `unref()`，子进程不拖住 admin 生命周期；spawn 失败或运行时报错一律静默降级（URL 已打印到终端）。

## 5. 测试

`tests/admin-live-tools.test.ts`（14 项）：

- `buildOpenCommand` 三平台命令构造；
- `readPrefetchStatus`：meta.json 优先 / mtime 回退 / 无缓存 null；
- `createPrefetchRunner`：并发守卫（重复触发 `PrefetchBusyError`）、`force: true` 传参、异常透传且运行态复位；
- HTTP：prefetch 200 / 409（并发，期间 status 显示 running）/ 500；status 端点；doctor online 参数解析 / 500。

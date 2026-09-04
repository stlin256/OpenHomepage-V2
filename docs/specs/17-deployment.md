# 17：全生态多平台一键部署（2026-09-04）

> 状态：已实现（Docker 构建未经本机实测，见 §7）。范围：Docker / docker-compose / Vercel / Netlify / Cloudflare Pages / Dev Container（Codespaces）/ README 一键部署徽章。
> 目标：落实总纲 `docs/ootb-experience-optimization-2026-09-04.md`「支柱五」——在既有 GitHub Actions → Pages 之外，为项目补齐零本地环境（云沙盒）与一键部署（云平台按钮、Docker 自托管）的全生态入口，同时不破坏「数据隐私彻底解耦」的核心承诺。

## 1. 构建管线事实核查（选型的前提）

`npm run build` = `generate-fonts` → `generate-og-images` → `astro build` → `optimize:critical-css` → `optimize:images`。对容器/云构建的关键事实（已读源码核实）：

- **无浏览器依赖**：`scripts/generate-og-images.ts` 是纯 `sharp` + 手拼 SVG（`src/lib/og-image.ts`），**不使用 playwright/chromium**。`playwright` 仅为 devDependency 供 `npm run screenshots` 本地截图用。
- **无系统级 native 依赖**：`sharp`（0.35+）通过 npm optional dependencies 分发预编译 libvips 二进制；`subset-font` 内置 harfbuzz WASM；`jimp` 为纯 JS。因此构建容器**无需 apt 安装任何编译链或系统库**。
- **Node 版本基线**：CI（`.github/workflows/deploy.yml`）使用 Node 24，`package.json` 要求 `>= 18.17`（README 声明；`engines` 字段暂缺）。各平台模板统一对齐 Node 24。
- **数据兜底**：`src/lib/data-dir.ts` 在 `data/` 缺失时回退 `data.example/`——这是所有「不带私有数据也能构建出完整演示站」方案的地基。
- **构建期生成物**：`public/fonts/`（generate-fonts）、`public/assets/og/`（generate-og-images）均为构建期产物且已被 `.gitignore` 忽略；构建容器内需从零生成，不能依赖拷贝。

## 2. Docker（自托管主路径）

### 2.1 `Dockerfile`（多阶段）

- **构建阶段 `node:24-slim`**：选 Debian slim（glibc）而非 alpine（musl）。sharp 对 musl 也有预编译包，但 glibc 预编译矩阵覆盖最稳、最接近 CI（ubuntu runner）行为，出问题时的排查成本最低；镜像体积代价由多阶段构建消化（运行阶段不带 node_modules）。
  1. `ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`：阻止 `npm ci` 时 playwright postinstall 下载约 400 MB 浏览器（构建管线用不到）。
  2. 先 `COPY package.json package-lock.json` + `npm ci`，再 `COPY . .`：保证依赖层可被 Docker layer cache 复用，源码变动不重装依赖。
  3. 可选 `ARG DATA_SOURCE_URL`：非空时 `apt` 临时安装 `curl/unzip/ca-certificates`，下载 `data.zip` 解压至 `/app/data`——与 `.github/workflows/deploy.yml` 的私有数据注入机制语义对齐。
  4. `RUN npm run build` 产出 `/app/dist`。
- **运行阶段 `nginx:alpine`**：仅 `COPY --from=builder /app/dist`，配合 `deploy/nginx.conf`，`EXPOSE 80`，含 `wget` 探活的 `HEALTHCHECK`（alpine 自带 busybox wget）。
- **构建 arg 不泄漏到最终镜像**：`DATA_SOURCE_URL` 的 `ARG` 声明在 builder 阶段；最终镜像 `FROM nginx:alpine` 重新开始，builder 阶段的 ARG/ENV/层历史均不进入最终镜像的 `docker history`。但预签名 URL 仍会出现在**构建日志**中，公共 CI 上需注意（见 §5）。

### 2.2 `deploy/nginx.conf`

放在 `deploy/` 子目录避免根目录堆文件；`Dockerfile` 显式拷贝至 `/etc/nginx/conf.d/default.conf`。缓存策略与站点指纹机制对齐：

| 路径 | 策略 | 依据 |
|------|------|------|
| `/_astro/*` | `expires 1y` + `immutable` | Astro 产物带内容 hash，永久缓存安全 |
| `/fonts/*` | `expires 30d` | 构建期 subset 字体，内容稳定 |
| `/assets/*` | `expires 7d` | 图片/OG 卡片/媒体 |
| HTML（`location /`） | `Cache-Control: no-cache` | 内容更新即时生效，协商缓存兜底 |

`try_files $uri $uri/ $uri/index.html =404` 适配 Astro 目录式路由（`/about/` → `/about/index.html`）。站点为纯静态多页输出，**不需要 SPA history fallback**（不写 `try_files ... /index.html` 单页回退，避免 404 被吞）。gzip 对 css/js/json/svg 开启。

### 2.3 `.dockerignore`

隐私与构建正确性双重目的：

- **隐私**：`/data/`（私有内容绝不进镜像）、`/public/assets/og/`（OG 卡片含私有页面标题，构建期重新生成）。
- **缓存正确性**：`node_modules/`、`dist*/`、`.cache/`、`.astro/`、`/public/fonts/`（均构建期重建，宿主机产物可能平台不兼容，如 Windows 的 sharp 二进制）。
- **瘦身**：`docs/`（含大量截图）、`tests/`、`skills/`、`admin/`、`.devcontainer/`、`.git/`、`.github/`、日志文件。构建管线经核实不引用这些目录。

### 2.4 `docker-compose.yml`

单服务 `web`：`build: .` + `ports: 8080:80` + `restart: unless-stopped`。`DATA_SOURCE_URL` 通过 compose 环境变量或取消注释的 `build.args` 注入（文件内注释说明）。不引入 v2 版 `version:` 顶层字段（compose spec 已废弃）。

## 3. 云平台模板

### 3.1 `vercel.json`

```json
{
  "framework": "astro",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

- Vercel 原生识别 Astro；显式声明三件套使 Deploy 按钮导入后零配置可用。
- **已知限制**：Vercel 的 Node 版本不支持在 `vercel.json` 中声明，只能在项目设置（*Settings → General → Node.js Version*）或 `package.json engines` 指定。本项目 `package.json` 暂无 `engines`（不在本期改动范围），Vercel 默认 Node 22 满足 `>= 18.17`，可正常构建；README 已注明推荐手动选 24.x。

### 3.2 `netlify.toml`

- `[build]`：`command = "npm run build"`，`publish = "dist"`。
- `[build.environment]`：`NODE_VERSION = "24"`（Netlify 支持在此锁版本，与 CI 对齐）。
- `[[headers]]`：为 `/_astro/*` 预置 `Cache-Control: public, max-age=31536000, immutable`，与 nginx 策略一致。

### 3.3 Cloudflare Pages

不新增仓库配置文件（Cloudflare 的构建配置在 dashboard，放 `wrangler.toml` 反而会被识别为 Workers 项目增加歧义）。README 给出三项 dashboard 设置：Build Command `npm run build`、Output `dist`、环境变量 `NODE_VERSION = 24`。

### 3.4 `.devcontainer/devcontainer.json`（Codespaces / VS Code Dev Containers）

- 镜像 `mcr.microsoft.com/devcontainers/javascript-node:24`（与 CI 对齐，免维护 Dockerfile）。
- `postCreateCommand: npm install`（不用 `npm ci`：云沙盒面向初次体验的贡献者，`install` 对 lockfile 漂移更宽容）。
- `forwardPorts: [4321, 4174]` + 端口标签：4321 = dev/preview，4174 = admin 后台（与 README CLI 表一致）。
- 预装 `astro-build.astro-vscode` 扩展。

## 4. README 徽章与文档

- 徽章区新增独立一行三个按钮（中英 README 同步）：
  - **Use this template**：shields 徽章指向 `https://github.com/stlin256/OpenHomepage-V2/generate`。
  - **Deploy with Vercel**：官方按钮 `https://vercel.com/button`，链接 `vercel.com/new/clone?repository-url=...`。
  - **Deploy to Netlify**：官方按钮 `netlify.com/img/deploy/button.svg`，链接 `app.netlify.com/start/deploy?repository=...`。
- 「🌐 Deployment & CI/CD / 部署与持续集成」章节在既有 GitHub Actions 内容后追加 Vercel / Netlify / Cloudflare Pages / Docker / Docker Compose / Codespaces 六个小节，中英对应，每节给出可复制的最小步骤；开头加 `> [!NOTE]` 隐私提示。

## 5. 隐私取舍（设计决策记录）

| 决策 | 取舍 |
|------|------|
| `data/` 进 `.dockerignore`，构建时 `ARG DATA_SOURCE_URL` 注入 | 本地私有目录**物理上不可能**进入镜像；代价是构建私有站点必须有可下载的 `data.zip` 直链（与 GitHub Actions 机制复用同一心智模型）。ARG 值会留在构建日志；最终镜像不含该 ARG（多阶段隔离），但公共 CI 构建日志可能记录预签名 URL——私有部署请用短期签名链接或私有 registry。 |
| 云平台（Vercel/Netlify/Cloudflare）默认构建 `data.example/` 演示站 | 这三个平台没有与 GitHub Secrets 等价的「私有数据注入」模板化方案，硬做需要用户自建数据拉取脚本，复杂度远超收益。定位为「一键体验演示站 + Fork 后自行扩展」，README 已注明部署真实内容的路径（私有 Fork 或 DATA_SOURCE_URL 机制）。 |
| 不把 `data.example/` 复制成 `data/` 再构建 | 与本地 `npm run build` 行为完全一致（`data-dir.ts` 自动回退），避免容器与本地两条构建路径分叉。 |

## 6. 文件清单

| 文件 | 作用 |
|------|------|
| `Dockerfile` | 多阶段构建：node:24-slim 构建 → nginx:alpine 托管 |
| `deploy/nginx.conf` | 静态托管 + 分级缓存 header + gzip |
| `.dockerignore` | 隐私排除（data/、OG 产物）+ 构建上下文瘦身 |
| `docker-compose.yml` | 单服务一键 `docker compose up --build`，8080:80 |
| `vercel.json` | Vercel 零配置导入 |
| `netlify.toml` | Netlify 构建命令 + Node 24 + 缓存 header |
| `.devcontainer/devcontainer.json` | Codespaces / Dev Container 云沙盒 |
| `README.md` / `README.zh-CN.md` | 三个部署徽章 + 六个平台小节（中英同步） |

## 7. 验证方法与结果

- **Docker**：本机无 `docker`（`which docker` 为空），**未实测镜像构建**。静态自查项：基础镜像 tag 存在（`node:24-slim`、`nginx:alpine`）；`npm ci` 在 slim 镜像无系统依赖（§1 已核实 sharp/subset-font/jimp 均为预编译/WASM/纯 JS）；nginx 配置语法对照官方文档；`.dockerignore` 不误伤构建所需文件（`scripts/`、`src/`、`public/`、`astro.config.mjs`、`tsconfig.json` 均保留）。待有 Docker 环境时验证：`docker build -t openhomepage-v2 . && docker run -p 8080:80 openhomepage-v2`，断言首页 200、`/_astro/*` 响应头含 `immutable`。
- **本地构建**：`npm run build`（Node v24.19.0）确认绿，证明云/容器使用的同一构建命令本身可用。
- **云平台**：`vercel.json` / `netlify.toml` 为声明式配置，按官方 schema 编写；真实部署需仓库主在平台上点击验证（Deploy 按钮链接已按官方格式构造）。

## 8. 已知限制与非目标

- Docker 镜像未实测（§7）；arm64（Apple Silicon / ARM 服务器）未验证，sharp 对 linux/arm64 glibc 有预编译包，预期可用。
- Vercel Node 版本无法在 `vercel.json` 锁定（平台限制），README 已注明手动设置路径。
- 「Use this template」按钮需要仓库主在 GitHub 仓库设置勾选 *Template repository* 后 `/generate` 链接才可用；未勾选时该链接 404。
- 不做：Kubernetes/Helm 编排、Traefik/Caddy 反代模板、Docker 内运行 admin 后台（admin 是本地工具，不是生产组件）、云平台私有数据注入脚手架。

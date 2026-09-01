/**
 * README 组件截图生成器（维护者工具）：
 * 静态服务 dist/ → Playwright 并发组件截图（en + zh 双语），输出 docs/images/components/。
 *
 * 前置条件：
 *   1. npm run build          # 生成最新 dist/（GitHub/RSS 区块需 .cache 预取数据）
 *   2. 首次运行安装浏览器：PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium
 *      （PLAYWRIGHT_BROWSERS_PATH=0 把浏览器装进 node_modules，不写全局缓存目录）
 *
 * 用法：
 *   npm run screenshots                       # 截取全部组件（en + zh 双语）
 *   npm run screenshots -- media-audio        # 仅截取指定组件（支持模糊匹配，如 audio、markdown）
 *   npm run screenshots -- --lang=zh audio    # 仅截取中文版的 audio 组件
 *   npm run screenshots -- --help             # 查看帮助
 */
import { createServer, type Server } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import sharp from "sharp";
import { resolveStaticPath, SERVE_MIME, type ServeIO } from "./serve-lib.ts";

// 必须先于 playwright 模块加载：浏览器二进制定位到 node_modules 内
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const OUT_DIR = path.join(ROOT, "docs/images/components");
const LANGS = ["en", "zh"] as const;
type Lang = (typeof LANGS)[number];

interface CliOptions {
  names: string[];
  langs: Lang[];
  help: boolean;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const names: string[] = [];
  let langs: Lang[] = [...LANGS];
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      help = true;
    } else if (arg.startsWith("--lang=") || arg.startsWith("-l=")) {
      const val = arg.split("=")[1] as Lang;
      if (LANGS.includes(val)) langs = [val];
    } else if (arg === "--lang" || arg === "-l") {
      const next = args[++i] as Lang;
      if (LANGS.includes(next)) langs = [next];
    } else if (arg.startsWith("--only=") || arg.startsWith("--name=")) {
      names.push(arg.split("=")[1]);
    } else if (arg === "--only" || arg === "--name" || arg === "-n") {
      const next = args[++i];
      if (next) names.push(next);
    } else if (!arg.startsWith("-")) {
      names.push(arg);
    }
  }

  return { names, langs, help };
}

function matchesFilter(shotName: string, filters: string[]): boolean {
  if (filters.length === 0) return true;
  return filters.some((f) => {
    const term = f.toLowerCase().trim();
    if (!term) return false;
    const name = shotName.toLowerCase();
    return name === term || name.includes(term) || (term.endsWith(".webp") && `${name}.webp`.includes(term));
  });
}

/** dist/ 静态服务（复用 serve-lib 的路径解析与 MIME 表） */
function startServer(): Promise<{ server: Server; origin: string }> {
  const io: ServeIO = {
    exists: (p) => existsSync(p),
    read: (p) => readFileSync(p, "utf8"),
    kind: (p) => {
      try {
        return statSync(p).isDirectory() ? "dir" : "file";
      } catch {
        return null;
      }
    },
  };
  const server = createServer((req, res) => {
    const file = resolveStaticPath(DIST, req.url ?? "/", io);
    if (!file) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": SERVE_MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": statSync(file).size,
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

/** 冻结动效 + 强制 reveal 完成 + 藏起右下角联系卡（避免悬浮元素叠进其他组件截图），保证截图确定性 */
async function stabilize(page: Page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation: none !important; transition: none !important; }
      html.js .reveal { opacity: 1 !important; transform: none !important; }
      /* 热力图格子的显现靠 heat-in 动画（初始 opacity:0），动画禁用后需强制可见 */
      html.js .block-github .heatmap .heat-cell { opacity: 1 !important; transform: none !important; }
      .intro-card { display: none !important; }
    `,
  });
  await page.evaluate("document.fonts.ready");
}

/** 恢复显示联系卡（contact-card / qr-modal 截图前调用） */
async function showContactCard(page: Page) {
  await page.addStyleTag({ content: ".intro-card { display: block !important; }" });
}

type ShotPage = "home" | "features" | "gallery";

interface Shot {
  /** 输出文件名（不含 -lang 后缀与扩展名） */
  name: string;
  page: ShotPage;
  /** 元素选择器；fullPage 时仅用于等待就绪 */
  selector: string;
  /** 同选择器多匹配时取第 nth 个 */
  nth?: number;
  /** 截取周边的内边距（CSS 像素，默认 28px） */
  padding?: number;
  /** 截整页视口（对话框/灯箱等顶层浮层） */
  fullViewport?: boolean;
  /** 额外的就绪等待（如流式播放完成） */
  waitFor?: string;
  /** 截图前的交互 */
  prepare?: (page: Page, lang: Lang) => Promise<void>;
  /** 截图后的清理（如关闭弹窗/抽屉） */
  after?: (page: Page) => Promise<void>;
  /** 自定义截图逻辑（可选） */
  capture?: (page: Page, lang: Lang) => Promise<Buffer>;
}

/**
 * 隔离目标组件并携带优雅页边距截图：
 * 1. 滚动使目标处于舒适可视区；
 * 2. 注入全局样式将其他无关 DOM 元素设为 visibility: hidden，保留真实排版与背景；
 * 3. 扩大 boundingBox 截取组件及周边背景页边距，绝不泄露任何周边无关元素。
 */
async function captureElementWithPadding(
  page: Page,
  selector: string,
  nth = 0,
  pad = 28,
): Promise<Buffer> {
  const el = page.locator(selector).nth(nth);
  await el.waitFor({ state: "attached", timeout: 10_000 });

  await el.evaluate((node, pad) => {
    const rect = node.getBoundingClientRect();
    if (rect.top < pad + 15 || rect.bottom > window.innerHeight - pad - 15) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + rect.top - pad - 15),
        behavior: "instant",
      });
    }
  }, pad);

  await page.waitForTimeout(40);

  await el.evaluate((node) => {
    node.classList.add("__oh_shot_target");
    let style = document.getElementById("__oh_shot_style");
    if (!style) {
      style = document.createElement("style");
      style.id = "__oh_shot_style";
      style.textContent = `
        body * { visibility: hidden !important; }
        .__oh_shot_target,
        .__oh_shot_target *,
        .__oh_shot_target::before,
        .__oh_shot_target::after,
        .__oh_shot_target *::before,
        .__oh_shot_target *::after {
          visibility: visible !important;
        }
      `;
      document.head.appendChild(style);
    }
  });

  const box = await el.boundingBox();
  if (!box) {
    throw new Error(`Bounding box null for ${selector}`);
  }

  const clip = {
    x: Math.max(0, Math.floor(box.x - pad)),
    y: Math.max(0, Math.floor(box.y - pad)),
    width: Math.ceil(box.width + (box.x - Math.max(0, Math.floor(box.x - pad))) + pad),
    height: Math.ceil(box.height + (box.y - Math.max(0, Math.floor(box.y - pad))) + pad),
  };

  const buf = await page.screenshot({ clip });

  await el.evaluate((node) => {
    node.classList.remove("__oh_shot_target");
    const style = document.getElementById("__oh_shot_style");
    if (style) style.remove();
  });

  return buf;
}

const SHOTS: Shot[] = [
  // —— 主页区块 ——
  { name: "profile", page: "home", selector: ".block-profile", padding: 28 },
  {
    name: "stream",
    page: "home",
    selector: ".block-streaming",
    waitFor: ".block-streaming .stream-done",
    padding: 28,
  },
  { name: "editorial-list", page: "home", selector: ".block-editorial", nth: 0, padding: 28 },
  { name: "editorial-tiles", page: "home", selector: ".block-editorial", nth: 1, padding: 28 },
  { name: "github-heatmap", page: "home", selector: ".block-github .heatmap-wrap", padding: 28 },
  { name: "github-repos", page: "home", selector: ".block-github .gh-grid", padding: 28 },
  { name: "rss", page: "home", selector: ".block-rss", padding: 28 },
  { name: "notice-banner", page: "home", selector: ".notice-banner", waitFor: ".notice-banner.visible", padding: 28 },
  // 顶部工具栏：包含搜索、BGM、语言切换与主题切换 4 个小方块按钮
  { name: "header-tools", page: "home", selector: ".header-tools", padding: 24 },
  {
    name: "lang-switcher",
    page: "home",
    selector: ".lang-switcher",
    padding: 24,
    prepare: async (page) => {
      await page.click(".lang-toggle");
      await page.waitForSelector(".lang-menu.open");
      await page.waitForTimeout(60);
    },
    capture: async (page) => {
      const pad = 24;
      const toggle = page.locator(".lang-toggle");
      const menu = page.locator(".lang-menu");
      await page.evaluate(() => {
        const switcher = document.querySelector(".lang-switcher");
        if (switcher) switcher.classList.add("__oh_shot_target");
        let style = document.getElementById("__oh_shot_style");
        if (!style) {
          style = document.createElement("style");
          style.id = "__oh_shot_style";
          style.textContent = `
            body * { visibility: hidden !important; }
            .__oh_shot_target, .__oh_shot_target *, .__oh_shot_target::before, .__oh_shot_target::after, .__oh_shot_target *::before, .__oh_shot_target *::after {
              visibility: visible !important;
            }
          `;
          document.head.appendChild(style);
        }
      });
      const tBox = await toggle.boundingBox();
      const mBox = await menu.boundingBox();
      if (!tBox || !mBox) throw new Error("Bounding box null for lang-switcher");
      const x = Math.min(tBox.x, mBox.x);
      const y = Math.min(tBox.y, mBox.y);
      const width = Math.max(tBox.x + tBox.width, mBox.x + mBox.width) - x;
      const height = Math.max(tBox.y + tBox.height, mBox.y + mBox.height) - y;
      const clip = {
        x: Math.max(0, Math.floor(x - pad)),
        y: Math.max(0, Math.floor(y - pad)),
        width: Math.ceil(width + (x - Math.max(0, Math.floor(x - pad))) + pad),
        height: Math.ceil(height + (y - Math.max(0, Math.floor(y - pad))) + pad),
      };
      const buf = await page.screenshot({ clip });
      await page.evaluate(() => {
        const switcher = document.querySelector(".lang-switcher");
        if (switcher) switcher.classList.remove("__oh_shot_target");
        const style = document.getElementById("__oh_shot_style");
        if (style) style.remove();
      });
      return buf;
    },
  },
  {
    name: "contact-card",
    page: "home",
    selector: ".intro-card.visible",
    waitFor: ".intro-card.visible",
    padding: 28,
    prepare: showContactCard,
  },
  // 模态框务必放最后：showModal 后页面其余元素进入 inert 状态，会拦截后续点击
  {
    name: "search-dialog",
    page: "home",
    selector: "dialog.search-dialog",
    fullViewport: true,
    prepare: async (page, lang) => {
      await page.click(".search-toggle");
      await page.waitForSelector(".search-dialog:not([hidden])");
      const input = page.locator(".search-input");
      const keyword = lang === "zh" ? "推理" : "inference";
      await input.fill(keyword);
      await page.waitForSelector(".search-results .search-result-link", { timeout: 5000 });
      await page.waitForTimeout(100);
    },
    after: async (page) => {
      await page.evaluate(() => {
        const d = document.querySelector("dialog.search-dialog");
        if (d) {
          try { (d as HTMLDialogElement).close?.(); } catch {}
          (d as HTMLElement).hidden = true;
          d.classList.remove("open");
        }
      });
    },
  },
  {
    name: "bgm-drawer",
    page: "home",
    selector: ".bgm-drawer",
    padding: 28,
    prepare: async (page) => {
      await page.evaluate(() => {
        const drawer = document.querySelector<HTMLElement>(".bgm-drawer");
        if (drawer) {
          drawer.hidden = false;
          drawer.classList.add("open");
        }
      });
      await page.waitForSelector(".bgm-drawer.open:not([hidden])");
      await page.waitForTimeout(100);
    },
    after: async (page) => {
      await page.evaluate(() => {
        const drawer = document.querySelector<HTMLElement>(".bgm-drawer");
        if (drawer) {
          drawer.classList.remove("open");
          drawer.hidden = true;
        }
      });
    },
  },
  {
    name: "qr-modal",
    page: "home",
    selector: "dialog.qr-modal",
    fullViewport: true,
    prepare: async (page) => {
      await showContactCard(page);
      await page.waitForSelector(".intro-card.visible");
      await page.click(".intro-card .intro-content");
      await page.waitForSelector("dialog.qr-modal[open]");
    },
    after: async (page) => {
      await page.evaluate(() => {
        const d = document.querySelector("dialog.qr-modal");
        if (d) {
          try { (d as HTMLDialogElement).close?.(); } catch {}
          d.removeAttribute("open");
        }
      });
    },
  },
  // —— 特性页：Markdown 渲染能力 ——
  {
    name: "footnote",
    page: "features",
    selector: ".page-content a[data-footnote-ref]",
    padding: 24,
    prepare: async (page) => {
      const ref = page.locator(".page-content a[data-footnote-ref]").first();
      await ref.scrollIntoViewIfNeeded();
      await ref.hover();
      await page.waitForSelector(".footnote-popover.visible");
      await page.waitForTimeout(100);
    },
    capture: async (page) => {
      const pad = 24;
      const ref = page.locator(".page-content a[data-footnote-ref]").first();
      const pop = page.locator(".footnote-popover");
      await page.evaluate(() => {
        const refEl = document.querySelector(".page-content a[data-footnote-ref]");
        const popEl = document.querySelector(".footnote-popover");
        const paragraph = refEl?.closest("p");
        if (refEl) refEl.classList.add("__oh_shot_target");
        if (popEl) popEl.classList.add("__oh_shot_target");
        if (paragraph) paragraph.classList.add("__oh_shot_target");
        let style = document.getElementById("__oh_shot_style");
        if (!style) {
          style = document.createElement("style");
          style.id = "__oh_shot_style";
          style.textContent = `
            body * { visibility: hidden !important; }
            .__oh_shot_target, .__oh_shot_target *, .__oh_shot_target::before, .__oh_shot_target::after, .__oh_shot_target *::before, .__oh_shot_target *::after {
              visibility: visible !important;
            }
          `;
          document.head.appendChild(style);
        }
      });
      const pBox = await ref.locator("xpath=ancestor::p").boundingBox();
      const popBox = await pop.boundingBox();
      if (!pBox || !popBox) throw new Error("Bounding box null for footnote");
      const x = Math.min(pBox.x, popBox.x);
      const y = Math.min(pBox.y, popBox.y);
      const width = Math.max(pBox.x + pBox.width, popBox.x + popBox.width) - x;
      const height = Math.max(pBox.y + pBox.height, popBox.y + popBox.height) - y;
      const clip = {
        x: Math.max(0, Math.floor(x - pad)),
        y: Math.max(0, Math.floor(y - pad)),
        width: Math.ceil(width + (x - Math.max(0, Math.floor(x - pad))) + pad),
        height: Math.ceil(height + (y - Math.max(0, Math.floor(y - pad))) + pad),
      };
      const buf = await page.screenshot({ clip });
      await page.evaluate(() => {
        document.querySelectorAll(".__oh_shot_target").forEach((t) => t.classList.remove("__oh_shot_target"));
        const style = document.getElementById("__oh_shot_style");
        if (style) style.remove();
      });
      return buf;
    },
    after: async (page) => {
      await page.evaluate(() => {
        const pop = document.querySelector<HTMLElement>(".footnote-popover");
        if (pop) {
          pop.classList.remove("visible");
          pop.hidden = true;
        }
      });
    },
  },
  { name: "markdown-code", page: "features", selector: ".page-content pre.shiki", nth: 0, padding: 28 },
  { name: "markdown-math", page: "features", selector: ".page-content .katex-display", nth: 0, padding: 28 },
  { name: "markdown-figure", page: "features", selector: ".page-content figure", nth: 0, padding: 28 },
  { name: "markdown-grid", page: "features", selector: ".page-content .md-grid", nth: 0, padding: 28 },
  {
    name: "media-audio",
    page: "features",
    selector: ".page-content .audio-player",
    padding: 28,
    capture: async (page) => {
      const audios = page.locator(".page-content .audio-player");
      const count = await audios.count();
      if (count === 0) throw new Error("No audio player found");
      const pad = 28;

      await audios.first().evaluate((node, pad) => {
        const rect = node.getBoundingClientRect();
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top - pad - 15),
          behavior: "instant",
        });
      }, pad);
      await page.waitForTimeout(40);

      await page.evaluate(() => {
        const targets = document.querySelectorAll(".page-content .audio-player");
        targets.forEach((t) => t.classList.add("__oh_shot_target"));
        const style = document.createElement("style");
        style.id = "__oh_shot_style";
        style.textContent = `
          body * { visibility: hidden !important; }
          .__oh_shot_target,
          .__oh_shot_target *,
          .__oh_shot_target::before,
          .__oh_shot_target::after,
          .__oh_shot_target *::before,
          .__oh_shot_target *::after {
            visibility: visible !important;
          }
        `;
        document.head.appendChild(style);
      });

      const first = await audios.first().boundingBox();
      const last = await audios.nth(count - 1).boundingBox();
      if (!first || !last) throw new Error("Bounding box failed for audios");

      const x = Math.floor(Math.min(first.x, last.x));
      const y = Math.floor(Math.min(first.y, last.y));
      const width = Math.ceil(Math.max(first.x + first.width, last.x + last.width) - x);
      const height = Math.ceil(last.y + last.height - y);

      const clip = {
        x: Math.max(0, x - pad),
        y: Math.max(0, y - pad),
        width: width + (x - Math.max(0, x - pad)) + pad,
        height: height + (y - Math.max(0, y - pad)) + pad,
      };

      const buf = await page.screenshot({ clip });

      await page.evaluate(() => {
        document.querySelectorAll(".__oh_shot_target").forEach((t) => t.classList.remove("__oh_shot_target"));
        const style = document.getElementById("__oh_shot_style");
        if (style) style.remove();
      });

      return buf;
    },
  },
  {
    name: "media-video",
    page: "features",
    selector: ".page-content .embed-player",
    padding: 28,
    prepare: async (page) => {
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll(".page-content .embed-player .embed-poster")).every(
          (img) => { const image = img as HTMLImageElement; return image.complete && image.naturalWidth > 0; },
        ),
        undefined,
        { timeout: 120_000 },
      );
    },
    capture: async (page, lang) =>
      captureElementWithPadding(
        page,
        `.page-content .embed-${lang === "zh" ? "bilibili" : "youtube"}`,
        0,
        28,
      ),
  },
  { name: "ghcard", page: "features", selector: ".page-content .gh-repo", nth: 0, padding: 28 },
  // —— 特性页：P0 & P1 学术、注记与目录 ——
  { name: "markdown-callout", page: "features", selector: ".page-content .callout", nth: 0, padding: 28 },
  { name: "timeline", page: "features", selector: ".page-content .timeline", nth: 0, padding: 28 },
  { name: "publications", page: "features", selector: ".page-content .publications", nth: 0, padding: 28 },
  { name: "toc-sidebar", page: "features", selector: ".article-layout .toc-sidebar", nth: 0, padding: 28 },

  // —— 画廊页与全局交互 ——
  { name: "gallery-grid", page: "gallery", selector: ".page-content .md-grid", nth: 0, padding: 28 },
  {
    name: "lightbox",
    page: "gallery",
    selector: ".lightbox",
    fullViewport: true,
    prepare: async (page) => {
      await page.click(".page-content .md-grid img");
      await page.waitForSelector(".lightbox:not([hidden])");
      await page.waitForTimeout(60);
    },
  },
];

/** 截图缓冲 → 统一后处理：限宽 1600 + WebP（带重试机制，防止 Windows 杀毒/索引文件并发锁） */
async function saveShot(buf: Buffer, name: string): Promise<string> {
  const out = path.join(OUT_DIR, `${name}.webp`);
  const webp = await sharp(buf)
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      writeFileSync(out, webp);
      return out;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
  return out;
}

const PAGE_URL: Record<ShotPage, Record<Lang, string>> = {
  home: { zh: "/", en: "/en/" },
  features: { zh: "/features/", en: "/en/features/" },
  gallery: { zh: "/gallery/", en: "/en/gallery/" },
};

async function shotLanguage(
  context: BrowserContext,
  origin: string,
  lang: Lang,
  activeShots: Shot[],
  shouldShotDark: boolean,
): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;

  for (const pageName of ["home", "features", "gallery"] as const) {
    const shots = activeShots.filter((s) => s.page === pageName);
    if (!shots.length) continue;
    const page = await context.newPage();
    const url = `${origin}${PAGE_URL[pageName][lang]}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await stabilize(page);

    for (const shot of shots) {
      try {
        if (shot.waitFor) await page.waitForSelector(shot.waitFor, { timeout: 120_000, state: "attached" });
        await page.waitForSelector(shot.selector, { state: "attached", timeout: 10_000 });
        if (shot.prepare) await shot.prepare(page, lang);
        const name = `${shot.name}-${lang}`;
        if (shot.capture) {
          await saveShot(await shot.capture(page, lang), name);
        } else if (shot.fullViewport) {
          await saveShot(await page.screenshot(), name);
        } else {
          const buf = await captureElementWithPadding(
            page,
            shot.selector,
            shot.nth ?? 0,
            shot.padding ?? 28,
          );
          await saveShot(buf, name);
        }
        if (shot.after) await shot.after(page);
        ok++;
        console.log(`✓ ${name}.webp`);
      } catch (e) {
        fail++;
        console.warn(`✗ ${shot.name}-${lang}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    await page.close();
  }

  // 暗色主题（仅 home profile，每种语言一张）
  if (shouldShotDark) {
    try {
      const dark = await context.newPage();
      await dark.addInitScript(() => {
        try {
          sessionStorage.setItem("theme", "dark");
        } catch {}
      });
      const url = `${origin}${PAGE_URL.home[lang]}`;
      await dark.goto(url, { waitUntil: "domcontentloaded" });
      await stabilize(dark);
      const buf = await captureElementWithPadding(dark, ".block-profile", 0, 28);
      await saveShot(buf, `profile-dark-${lang}`);
      ok++;
      console.log(`✓ profile-dark-${lang}.webp`);
      await dark.close();
    } catch (e) {
      fail++;
      console.warn(`✗ profile-dark-${lang}: ${(e as Error).message.split("\n")[0]}`);
    }
  }

  return { ok, fail };
}

async function main() {
  const cli = parseCliArgs();
  if (cli.help) {
    console.log(`
用法:
  npm run screenshots [选项] [组件名...]

选项:
  -l, --lang <en|zh>    指定语言 (默认: en, zh 双语)
  -n, --name <名称>     指定要截图的组件名称 (支持模糊匹配)
  -h, --help            显示本帮助信息

可用组件名:
  ${SHOTS.map((s) => s.name).join(", ")}, profile-dark

示例:
  npm run screenshots media-audio           # 仅截取 audio 组件 (中英双语)
  npm run screenshots --lang=zh media-audio  # 仅截取中文版 audio 组件
  npm run screenshots markdown              # 截取所有 markdown-* 组件
`);
    return;
  }

  if (!existsSync(path.join(DIST, "index.html"))) {
    console.error("dist/ 不存在，请先运行 npm run build");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const activeShots = SHOTS.filter((s) => matchesFilter(s.name, cli.names));
  const shouldShotDark = matchesFilter("profile-dark", cli.names) || (cli.names.length === 0 && matchesFilter("profile", cli.names));

  if (activeShots.length === 0 && !shouldShotDark) {
    console.warn(`未匹配到任何组件截图目标: ${cli.names.join(", ")}`);
    console.log(`可用目标: ${SHOTS.map((s) => s.name).join(", ")}, profile-dark`);
    return;
  }

  console.log(`开始截图: ${activeShots.map((s) => s.name).join(", ")}${shouldShotDark ? ", profile-dark" : ""} (语言: ${cli.langs.join(", ")})`);

  const startTime = Date.now();
  const { server, origin } = await startServer();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let ok = 0;
  let fail = 0;

  try {
    // 语言级别并发：中英文两个 context 并行截取
    const results = await Promise.all(
      cli.langs.map(async (lang) => {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 1000 },
          deviceScaleFactor: 2,
          reducedMotion: "reduce",
          locale: lang === "zh" ? "zh-CN" : "en-US",
        });
        try {
          return await shotLanguage(context, origin, lang, activeShots, shouldShotDark);
        } finally {
          await context.close();
        }
      })
    );

    for (const r of results) {
      ok += r.ok;
      fail += r.fail;
    }
  } finally {
    await browser.close();
    server.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n完成：${ok} 张成功${fail ? `，${fail} 张失败` : ""} (${elapsed}s) → ${path.relative(ROOT, OUT_DIR)}/`);
  if (fail) process.exit(1);
}

main();

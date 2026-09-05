/**
 * 前端交互入口（src/scripts/interactions.ts）jsdom 测试：
 * 导航拦截、编辑模式超链接保护、语言引导。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("interactions：编辑模式下超链接与导航行为", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("编辑模式（oh-edit）下，点击页面内链接阻止默认跳转且不发起 swapContent fetch", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "<main class='site-main'><p>新页面</p></main>",
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.classList.add("oh-edit");
    document.body.innerHTML = [
      '<nav class="site-nav"><a id="nav-link" href="/features/">功能</a></nav>',
      '<main class="site-main"><a id="content-link" href="/research/">研究</a></main>',
    ].join("");

    await import("../src/scripts/interactions.ts");

    const link = document.querySelector<HTMLAnchorElement>("#nav-link")!;
    const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(clickEvt);

    expect(clickEvt.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("编辑模式下 overlay 内部链接（如 ←后台）不被 interactions 拦截", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.classList.add("oh-edit");
    document.body.innerHTML = [
      '<div class="oh-topbar"><a class="oh-back" href="http://127.0.0.1:4174">←后台</a></div>',
    ].join("");

    await import("../src/scripts/interactions.ts");

    const backLink = document.querySelector<HTMLAnchorElement>(".oh-back")!;
    const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
    backLink.dispatchEvent(clickEvt);

    expect(clickEvt.defaultPrevented).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非编辑模式下，点击站内链接正常触发 swapContent", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => "<main class='site-main'><p>新页面</p></main>",
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.body.innerHTML = [
      '<nav class="site-nav"><a id="nav-link" href="/features/">功能</a></nav>',
      '<main class="site-main"><p>原页面</p></main>',
    ].join("");

    await import("../src/scripts/interactions.ts");

    const link = document.querySelector<HTMLAnchorElement>("#nav-link")!;
    const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(clickEvt);

    expect(clickEvt.defaultPrevented).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/features/");
    await vi.waitFor(() => {
      expect(document.querySelector("main.site-main")?.textContent).toBe("新页面");
    });
  });

  it("同页锚点链接平滑滚动且不触发 swapContent fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    document.body.innerHTML = [
      "<a id='anchor-link' href='#target-section'>跳到目标</a>",
      "<main class='site-main'><section id='target-section'>目标</section></main>",
    ].join("");
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;

    const targetSection = document.querySelector<HTMLElement>("#target-section")!;
    targetSection.getBoundingClientRect = () => ({
      top: 500,
      bottom: 600,
      height: 100,
      width: 500,
      left: 0,
      right: 500,
      x: 0,
      y: 500,
      toJSON: () => {},
    });

    await import("../src/scripts/interactions.ts");
    const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector<HTMLAnchorElement>("#anchor-link")!.dispatchEvent(clickEvt);

    expect(clickEvt.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.hash).toBe("#target-section");
    expect(scrollTo).toHaveBeenCalled();
  });

  it("移动端展开 TOC 折叠面板时点击锚点，scrollToAnchor 会正确扣除折叠高度误差", async () => {
    document.body.innerHTML = `
      <details class="toc-collapsible" open>
        <summary>文章目录</summary>
        <div class="toc-collapsible-body">
          <nav class="toc"><a id="toc-item-link" class="toc-link" href="#chapter-2">第二章</a></nav>
        </div>
      </details>
      <main class="site-main">
        <h2 id="chapter-2">第二章</h2>
      </main>
    `;
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    Object.defineProperty(window, "innerWidth", { value: 375, configurable: true });

    const collapsibleBody = document.querySelector<HTMLElement>(".toc-collapsible-body")!;
    collapsibleBody.getBoundingClientRect = () => ({
      top: 50,
      bottom: 350,
      height: 300,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 50,
      toJSON: () => {},
    });

    const targetHeading = document.querySelector<HTMLElement>("#chapter-2")!;
    targetHeading.getBoundingClientRect = () => ({
      top: 800,
      bottom: 840,
      height: 40,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 800,
      toJSON: () => {},
    });

    const { scrollToAnchor } = await import("../src/scripts/interactions.ts");
    scrollToAnchor(targetHeading);

    // targetTop (800) - collapsingHeight (300) - headerOffset (72) = 428
    expect(scrollTo).toHaveBeenCalledWith({
      top: 428,
      behavior: "smooth",
    });
  });

  it("RSS 封面加载失败时保留占位并标记淡出", async () => {
    document.body.innerHTML = `
      <a class="rss-card">
        <span class="rss-cover" id="rss-cover"><img id="rss-img" src="/missing.webp" alt=""></span>
        <span class="rss-card-body">内容</span>
      </a>
    `;
    await import("../src/scripts/interactions.ts");
    document.querySelector<HTMLImageElement>("#rss-img")!.dispatchEvent(
      new Event("error", { bubbles: true })
    );

    const cover = document.querySelector<HTMLElement>("#rss-cover")!;
    expect(cover.isConnected).toBe(true);
    expect(cover.classList.contains("cover-failed")).toBe(true);
  });

  it("语言切换后，导航栏站点标题链接同步到当前语言首页", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='en'><head><title>Home</title></head><body>",
      "<nav class='site-nav'><p class='site-title'><a href='/en/'>English Site</a></p><ul><li><a href='/en/'>Home</a></li></ul></nav>",
      "<main class='site-main'><p>English home</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => targetHtml,
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "zh,en";
    localStorage.setItem("oh-language", "zh");
    document.body.innerHTML = [
      "<nav class='site-nav'>",
      "<p class='site-title'><a id='site-title-link' href='/'>中文站名</a></p>",
      "<ul><li><a href='/'>主页</a></li></ul>",
      "</nav>",
      "<div class='lang-switcher'><ul class='lang-menu'><li><a id='switch-en' href='/en/' hreflang='en'>English</a></li></ul></div>",
      "<main class='site-main'><p>中文页面</p></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    document.querySelector<HTMLAnchorElement>("#switch-en")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );

    await vi.waitFor(() => {
      expect(document.querySelector<HTMLAnchorElement>(".site-title a")?.getAttribute("href")).toBe("/en/");
    });
    expect(document.querySelector(".site-title a")?.textContent).toBe("English Site");
  });

  it("语言菜单 A 方案：FLIP 换序并保留动画节点", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='en'><head><title>Home</title></head><body>",
      "<nav class='site-nav'><p class='site-title'><a href='/en/'>English Site</a></p><ul><li><a href='/en/'>Home</a></li></ul></nav>",
      "<div class='lang-switcher'><ul class='lang-menu'>",
      "<li><a href='/en/' hreflang='en'>English</a></li>",
      "<li><a href='/fr/' hreflang='fr'>Français</a></li>",
      "<li><a href='/ja/' hreflang='ja'>日本語</a></li>",
      "<li><a href='/' hreflang='zh'>中文</a></li>",
      "</ul></div>",
      "<main class='site-main'><p>English home</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => targetHtml,
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "en,fr,ja,zh";
    localStorage.setItem("oh-language", "zh");
    document.body.innerHTML = [
      "<nav class='site-nav'><p class='site-title'><a id='site-title-link' href='/'>中文站名</a></p></nav>",
      "<div class='lang-switcher'><ul class='lang-menu'>",
      "<li><a id='current-zh' class='active' href='/' hreflang='zh' aria-current='true'>中文</a></li>",
      "<li><a id='switch-en' href='/en/' hreflang='en'>English</a></li>",
      "<li><a id='switch-fr' href='/fr/' hreflang='fr'>Français</a></li>",
      "<li><a id='switch-ja' href='/ja/' hreflang='ja'>日本語</a></li>",
      "</ul></div>",
      "<main class='site-main'><p>中文页面</p></main>",
    ].join("");

    const menu = document.querySelector(".lang-menu")!;
    for (const item of menu.querySelectorAll("li")) {
      Object.defineProperty(item, "getBoundingClientRect", {
        configurable: true,
        // jsdom 没有布局；按当前 DOM 顺序动态返回行顶点，FLIP 前后才能得到位移。
        value: () => ({ top: [...menu.children].indexOf(item) * 34 }),
      });
    }
    const animateMock = vi.fn((..._args: unknown[]) => ({ cancel: vi.fn() }) as unknown as Animation);
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animateMock,
    });

    try {
      await import("../src/scripts/interactions.ts");
      document.querySelector<HTMLAnchorElement>("#switch-en")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );

      await vi.waitFor(() => {
        expect(document.querySelector(".site-title a")?.textContent).toBe("English Site");
      });

      expect([...document.querySelectorAll(".lang-menu a[hreflang]")].map((link) => link.getAttribute("hreflang")))
        .toEqual(["en", "fr", "ja", "zh"]);
      expect(document.querySelector("#switch-en")?.classList.contains("active")).toBe(true);
      expect(document.querySelector("#current-zh")?.classList.contains("active")).toBe(false);
      expect(document.querySelector("#switch-en")?.getAttribute("aria-current")).toBe("true");
      expect(document.querySelector(".lang-menu")?.classList.contains("open")).toBe(true);
      // 内容交换后不重建等价菜单，FLIP 动画节点保留。
      expect(document.querySelector("#switch-en")).not.toBeNull();
      expect(animateMock).toHaveBeenCalledTimes(4);
      expect(animateMock.mock.calls[0][0]).toEqual([
        { transform: "translateY(34px) translateX(12px) scale(0.96)", opacity: "0.58", offset: 0 },
        { transform: "translateY(15.3px) translateX(-4px) scale(1.025)", opacity: "1", offset: 0.58 },
        { transform: "translateY(0px) translateX(0px) scale(1)", opacity: "1" },
      ]);

      // 等 420ms 遮罩与 560ms FLIP 均结束后再释放本用例，避免污染后续假定时器用例。
      await new Promise((resolve) => setTimeout(resolve, 700));
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "animate", descriptor);
      else delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });

  it("语言切换遮罩结束前，不启动通知横幅与流式输出", async () => {
    vi.useFakeTimers();
    const targetHtml = [
      "<!doctype html><html data-route-lang='en'><head><title>Home</title></head><body>",
      "<main class='site-main'>",
      "<div class='notice-banner' data-delay='10'>English notice</div>",
      "<div class='stream-block' data-stream-id='welcome' data-autoplay='true' data-speed='40'>",
      "<div class='stream-content markdown-body'></div>",
      "<noscript><p>English stream</p></noscript>",
      "<script type='application/json' class='stream-tokens'>[]</script>",
      "</div>",
      "</main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => targetHtml,
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "zh,en";
    localStorage.setItem("oh-language", "zh");
    document.body.innerHTML = [
      "<div class='lang-switcher'><ul class='lang-menu'>",
      "<li><a id='switch-en' href='/en/' hreflang='en'>English</a></li>",
      "</ul></div>",
      "<main class='site-main'><p>中文页面</p></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

    try {
      document.querySelector<HTMLAnchorElement>("#switch-en")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );

      // 先等目标 HTML 完成解析与替换，再检查仍在 420ms 语言切换遮罩内。
      await vi.waitFor(() => {
        expect(document.querySelector("main.site-main")?.textContent).toContain("English notice");
      });
      await vi.advanceTimersByTimeAsync(40);
      expect(document.querySelector(".notice-banner")?.classList.contains("visible")).toBe(false);
      expect(document.querySelector<HTMLElement>(".stream-block")?.dataset.streamInit).toBeUndefined();
      expect(document.querySelector(".page-loading")?.classList.contains("visible")).toBe(true);
      const main = document.querySelector<HTMLElement>("main.site-main")!;
      expect(main.style.opacity).toBe("0");
      expect(main.style.transform).toBe("translateY(12px)");

      await vi.advanceTimersByTimeAsync(209);
      expect(document.querySelector(".notice-banner")?.classList.contains("visible")).toBe(false);
      expect(document.querySelector<HTMLElement>(".stream-block")?.dataset.streamInit).toBeUndefined();

      // 420ms 最短遮罩结束，再越过移除遮罩后的两帧与横幅自身 10ms 计时。
      await vi.advanceTimersByTimeAsync(171);
      await vi.advanceTimersByTimeAsync(60);
      expect(document.querySelector<HTMLElement>(".stream-block")?.dataset.streamInit).toBe("1");
      expect(document.querySelector(".notice-banner")?.classList.contains("visible")).toBe(true);
      expect(main.style.opacity).toBe("");
      expect(main.style.transform).toBe("");
      expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("跳转到启用阅读进度条的页面时，动态插入 .reading-progress 节点", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='zh'><head><title>特性</title></head><body>",
      "<div class='reading-progress' style='transform: scaleX(0)' aria-hidden='true'></div>",
      "<header class='site-header'>",
      "<nav class='site-nav'><a id='nav-link' href='/features/'>特性</a></nav>",
      "</header>",
      "<main class='site-main'><div class='page-content'><p>特性正文</p></div></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => targetHtml,
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.body.innerHTML = [
      "<header class='site-header'>",
      "<nav class='site-nav'><a id='nav-link' href='/features/'>特性</a></nav>",
      "</header>",
      "<main class='site-main'><p>主页无进度条</p></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    expect(document.querySelector(".reading-progress")).toBeNull();

    const link = document.querySelector<HTMLAnchorElement>("#nav-link")!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(document.querySelector(".reading-progress")).not.toBeNull();
    });
  });

  it("从带阅读进度条的页面跳转到未启用页面时，移除 .reading-progress 节点且不会残留进度条", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='zh'><head><title>主页</title></head><body>",
      "<header class='site-header'>",
      "<nav class='site-nav'><a id='nav-home' href='/'>主页</a></nav>",
      "</header>",
      "<main class='site-main'><p>主页内容</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => targetHtml,
    }));
    vi.stubGlobal("fetch", fetchMock);

    document.body.innerHTML = [
      "<div class='reading-progress' style='transform: scaleX(0.5)' aria-hidden='true'></div>",
      "<header class='site-header'>",
      "<nav class='site-nav'><a id='nav-home' href='/'>主页</a></nav>",
      "</header>",
      "<main class='site-main'><div class='page-content'><p>特性页</p></div></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    expect(document.querySelector(".reading-progress")).not.toBeNull();

    const link = document.querySelector<HTMLAnchorElement>("#nav-home")!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(document.querySelector(".reading-progress")).toBeNull();
    });
  });
  it("语言切换后，BGM 播放列表与全局 UI 无障碍文案同步到目标语言", async () => {
    const targetHtml = [
      "<!doctype html><html lang='en' data-route-lang='en'><head><title>Home</title></head><body>",
      "<header class='site-header'>",
      "<button class='nav-toggle' aria-label='Open navigation menu'></button>",
      "<nav class='site-nav' aria-label='Site navigation'><p class='site-title'><a href='/en/'>English Site</a></p></nav>",
      "<div class='header-tools'>",
      "<button class='search-toggle' aria-label='Search (Ctrl+K)'></button>",
      "<div class='bgm-switcher'>",
      "<button class='bgm-toggle' aria-label='Toggle background music' aria-haspopup='dialog'></button>",
      "<div class='bgm-drawer' aria-label='BGM Playlist'>",
      "<p class='bgm-drawer-title'>Playlist · Background music</p>",
      "<p class='bgm-current-title'>English track</p>",
      "<p class='bgm-current-artist'>English Site</p>",
      "<button class='bgm-prev-btn' aria-label='Previous'></button>",
      "<button class='bgm-play-btn' aria-label='Play/Pause'></button>",
      "<button class='bgm-next-btn' aria-label='Next'></button>",
      "<input class='bgm-volume-slider' aria-label='Volume'>",
      "<ul class='bgm-tracklist'><li class='bgm-track-item active' data-track-index='0'><span class='bgm-track-name'>English track</span></li></ul>",
      "</div>",
      "</div>",
      "<div class='lang-switcher'><button class='lang-toggle' aria-label='Switch language'></button></div>",
      "<button class='theme-toggle' aria-label='Toggle light/dark theme'></button>",
      "</div>",
      "</header>",
      "<audio class='bgm-audio' src='/assets/en-bgm.mp3' preload='none' data-volume='0.4' data-autoplay='false' data-resume='none' data-artist-fallback='English Site' data-tracks='[]'></audio>",
      "<dialog class='search-dialog' aria-label='Search (Ctrl+K)' hidden><p class='search-status'>Type keywords to search...</p><div class='search-footer'><span><span class='search-hint-nav'>Navigate</span></span><span><span class='search-hint-select'>Select</span></span><span><span class='search-hint-close'>Close</span></span></div></dialog>",
      "<div class='lightbox' aria-label='Image preview' hidden><button class='lightbox-close' aria-label='Close'></button></div>",
      "<div class='lang-switcher'><ul class='lang-menu'><li><a href='/en/' hreflang='en'>English</a></li></ul></div>",
      "<main class='site-main'><p>English home</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => targetHtml }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "zh,en";
    localStorage.setItem("oh-language", "zh");
    document.body.innerHTML = [
      "<header class='site-header'>",
      "<button class='nav-toggle' aria-label='打开导航菜单'></button>",
      "<nav class='site-nav' aria-label='站点导航'><p class='site-title'><a href='/'>中文站名</a></p></nav>",
      "<div class='header-tools'>",
      "<button class='search-toggle' aria-label='搜索 (Ctrl+K)'></button>",
      "<div class='bgm-switcher'>",
      "<button class='bgm-toggle' aria-label='切换背景音乐' aria-haspopup='dialog'></button>",
      "<div class='bgm-drawer' aria-label='BGM Playlist'>",
      "<p class='bgm-drawer-title'>播放列表 · 背景音乐</p>",
      "<p class='bgm-current-title'>English track</p>",
      "<p class='bgm-current-artist'>中文站名</p>",
      "<button class='bgm-prev-btn' aria-label='上一首'></button>",
      "<button class='bgm-play-btn' aria-label='播放/暂停'></button>",
      "<button class='bgm-next-btn' aria-label='下一首'></button>",
      "<input class='bgm-volume-slider' aria-label='音量'>",
      "<ul class='bgm-tracklist'><li class='bgm-track-item active' data-track-index='0'><span class='bgm-track-name'>English track</span></li></ul>",
      "</div>",
      "</div>",
      "<div class='lang-switcher'><button class='lang-toggle' aria-label='切换语言'></button></div>",
      "<button class='theme-toggle' aria-label='切换明暗主题'></button>",
      "</div>",
      "</header>",
      "<audio class='bgm-audio' src='/assets/en-bgm.mp3' preload='none' data-volume='0.4' data-autoplay='false' data-resume='none' data-artist-fallback='中文站名' data-tracks='[]'></audio>",
      "<dialog class='search-dialog' aria-label='搜索 (Ctrl+K)' hidden><p class='search-status'>输入关键词开始搜索...</p><div class='search-footer'><span><span class='search-hint-nav'>切换</span></span><span><span class='search-hint-select'>跳转</span></span><span><span class='search-hint-close'>关闭</span></span></div></dialog>",
      "<div class='lightbox' aria-label='图片预览' hidden><button class='lightbox-close' aria-label='关闭'></button></div>",
      "<div class='lang-switcher'><ul class='lang-menu'><li><a id='switch-en' href='/en/' hreflang='en'>English</a></li></ul></div>",
      "<main class='site-main'><p>中文页面</p></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");
    document.querySelector<HTMLAnchorElement>("#switch-en")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(document.querySelector(".site-title a")?.textContent).toBe("English Site");
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(document.querySelector<HTMLButtonElement>(".nav-toggle")?.getAttribute("aria-label")).toBe("Open navigation menu");
    expect(document.querySelector(".site-nav")?.getAttribute("aria-label")).toBe("Site navigation");
    expect(document.querySelector<HTMLButtonElement>(".bgm-toggle")?.getAttribute("aria-label")).toBe("Toggle background music");
    expect(document.querySelector(".bgm-drawer-title")?.textContent).toBe("Playlist · Background music");
    expect(document.querySelector<HTMLButtonElement>(".bgm-prev-btn")?.getAttribute("aria-label")).toBe("Previous");
    expect(document.querySelector<HTMLButtonElement>(".bgm-play-btn")?.getAttribute("aria-label")).toBe("Play/Pause");
    expect(document.querySelector<HTMLButtonElement>(".bgm-next-btn")?.getAttribute("aria-label")).toBe("Next");
    expect(document.querySelector<HTMLInputElement>(".bgm-volume-slider")?.getAttribute("aria-label")).toBe("Volume");
    expect(document.querySelector(".bgm-track-name")?.textContent).toBe("English track");
    expect(document.querySelector(".bgm-current-artist")?.textContent).toBe("English Site");
    expect(document.querySelector<HTMLButtonElement>(".lang-toggle")?.getAttribute("aria-label")).toBe("Switch language");
    expect(document.querySelector<HTMLButtonElement>(".theme-toggle")?.getAttribute("aria-label")).toBe("Toggle light/dark theme");
    expect(document.querySelector(".search-dialog")?.getAttribute("aria-label")).toBe("Search (Ctrl+K)");
    expect(document.querySelector(".search-status")?.textContent).toBe("Type keywords to search...");
    expect(document.querySelector(".search-hint-nav")?.textContent).toBe("Navigate");
    expect(document.querySelector(".lightbox")?.getAttribute("aria-label")).toBe("Image preview");
    expect(document.querySelector<HTMLButtonElement>(".lightbox-close")?.getAttribute("aria-label")).toBe("Close");
  });
  it("同语言内切换页面时，站点标题保持稳定且不被重新替换或触发淡入淡出", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='zh'><head><title>特性</title></head><body>",
      "<header class='site-header'>",
      "<nav class='site-nav'><p class='site-title'><a href='/'>中文站名</a></p><ul><li><a href='/features/'>特性</a></li></ul></nav>",
      "</header>",
      "<main class='site-main'><p>特性正文</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => targetHtml }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "zh,en";
    document.body.innerHTML = [
      "<header class='site-header'>",
      "<nav class='site-nav'><p class='site-title'><a id='original-title-link' href='/'>中文站名</a></p><ul><li><a id='nav-link' href='/features/'>特性</a></li></ul></nav>",
      "</header>",
      "<main class='site-main'><p>主页正文</p></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    const originalTitleLink = document.querySelector("#original-title-link")!;
    const navLink = document.querySelector<HTMLAnchorElement>("#nav-link")!;
    navLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(document.querySelector("main.site-main")?.textContent).toBe("特性正文");
    });

    // 标题节点未被销毁重建，依然是原 DOM 节点
    expect(document.querySelector("#original-title-link")).toBe(originalTitleLink);
    expect(document.querySelector(".site-title")?.classList.contains("chrome-fade-out")).toBe(false);
  });
});

describe("interactions：代码块人体工学与一键复制", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.documentElement.dataset.routeLang = "zh";
    vi.resetModules();
  });

  it("自动为 markdown 中的 pre 代码块添加包裹容器、语言角标与复制按钮", async () => {
    document.body.innerHTML = [
      "<main class='site-main'>",
      "  <div class='markdown-body'>",
      "    <pre class='shiki language-python'><code>def hello():\n    print('world')</code></pre>",
      "  </div>",
      "</main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    const wrapper = document.querySelector(".code-block-wrapper");
    expect(wrapper).not.toBeNull();
    const header = wrapper?.querySelector(".code-header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".code-lang")?.textContent).toBe("Python");
    expect(header?.querySelector(".code-copy-btn")).not.toBeNull();
    expect(header?.querySelector(".code-copy-text")?.textContent).toBe("复制代码");
  });

  it("点击复制按钮时调用 clipboard.writeText 并展示已复制反馈", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    document.body.innerHTML = [
      "<main class='site-main'>",
      "  <div class='markdown-body'>",
      "    <pre class='shiki language-ts'><code>const a: number = 42;</code></pre>",
      "  </div>",
      "</main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    const copyBtn = document.querySelector<HTMLButtonElement>(".code-copy-btn")!;
    expect(copyBtn).not.toBeNull();

    copyBtn.click();

    await vi.waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("const a: number = 42;");
      expect(copyBtn.classList.contains("copied")).toBe(true);
    });
    expect(copyBtn.querySelector(".code-copy-text")?.textContent).toBe("已复制");
  });
  it("通过 pre data-language 属性或 code class 准确识别并格式化代码语言角标", async () => {
    document.body.innerHTML = [
      "<main class='site-main'>",
      "  <div class='markdown-body'>",
      "    <pre class='shiki' data-language='python'><code class='language-python'>import torch</code></pre>",
      "    <pre class='shiki' data-language='sh'><code>npm run build</code></pre>",
      "    <pre class='plain-code'><code>no lang</code></pre>",
      "  </div>",
      "</main>",
    ].join("");

    const { formatCodeLanguage } = await import("../src/scripts/interactions.ts");
    expect(formatCodeLanguage("python")).toBe("Python");
    expect(formatCodeLanguage("py")).toBe("Python");
    expect(formatCodeLanguage("typescript")).toBe("TypeScript");
    expect(formatCodeLanguage("ts")).toBe("TypeScript");
    expect(formatCodeLanguage("sh")).toBe("Bash");
    expect(formatCodeLanguage("bash")).toBe("Bash");
    expect(formatCodeLanguage("rust")).toBe("Rust");
    expect(formatCodeLanguage("rs")).toBe("Rust");
    expect(formatCodeLanguage("cpp")).toBe("C++");
    expect(formatCodeLanguage("")).toBe("Code");
    expect(formatCodeLanguage("customlang")).toBe("Customlang");

    const wrappers = document.querySelectorAll(".code-block-wrapper");
    expect(wrappers.length).toBe(3);
    expect(wrappers[0].querySelector(".code-lang")?.textContent).toBe("Python");
    expect(wrappers[1].querySelector(".code-lang")?.textContent).toBe("Bash");
    expect(wrappers[2].querySelector(".code-lang")?.textContent).toBe("Code");
  });
  it("自动跳过学术成果中的 BibTeX pre 元素，保留原生抽屉样式与单复制按钮", async () => {
    document.body.innerHTML = [
      "<main class='site-main'>",
      "  <div class='markdown-body'>",
      "    <div class='publication-item'>",
      "      <button type='button' class='publication-copy' data-copy-bibtex='bibtex-paper1'>复制 BibTeX</button>",
      "      <div class='publication-bibtex'>",
      "        <pre id='bibtex-paper1' tabindex='0' data-pagefind-ignore>@article{paper1, title={Test Paper}}</pre>",
      "      </div>",
      "    </div>",
      "  </div>",
      "</main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    const wrappers = document.querySelectorAll(".code-block-wrapper");
    expect(wrappers.length).toBe(0);

    const bibtexPre = document.querySelector("#bibtex-paper1");
    expect(bibtexPre).not.toBeNull();
    expect(bibtexPre?.closest(".code-block-wrapper")).toBeNull();
    expect(document.querySelectorAll(".code-copy-btn").length).toBe(0);
    expect(document.querySelectorAll(".publication-copy").length).toBe(1);
  });
});

describe("interactions：导航开关、外链与嵌入播放器初始化", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    // 清空语言列表，避免 bootstrap 语言引导在无前缀路由上误触发真实 fetch
    document.documentElement.dataset.siteLangs = "";
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("点击 .nav-toggle 开合移动端导航，点击导航外区域自动收起", async () => {
    document.body.innerHTML = [
      "<header class='site-header'>",
      "<button class='nav-toggle' aria-expanded='false' aria-label='菜单'></button>",
      "<nav class='site-nav'><a href='/'>主页</a></nav>",
      "</header>",
      "<main class='site-main'><p>正文</p></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");
    const btn = document.querySelector<HTMLButtonElement>(".nav-toggle")!;

    btn.click();
    expect(document.body.classList.contains("nav-open")).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    btn.click();
    expect(document.body.classList.contains("nav-open")).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    // 再次打开后，点击导航与按钮之外的区域应自动收起。
    // 注：同文件先前用例动态 import 残留的 document 监听器会先一步移除 nav-open，
    // 使本模块的监听器提前 return（真实页面单实例无此问题），故这里只断言 class 行为。
    btn.click();
    expect(document.body.classList.contains("nav-open")).toBe(true);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.body.classList.contains("nav-open")).toBe(false);
  });

  it("markdown 外链自动补 target=_blank 与 rel=noopener，已有标注与站内链接不受影响", async () => {
    document.body.innerHTML = [
      "<main class='site-main'><div class='markdown-body'>",
      "<a id='ext-plain' href='https://example.com/a'>外链</a>",
      "<a id='ext-rel' href='//cdn.example.com/b' rel='nofollow' target='_self'>协议相对</a>",
      "<a id='ext-kept' href='https://example.com/c' rel='noopener' target='_blank'>已标注</a>",
      "<a id='internal' href='/inside/'>站内</a>",
      "</div></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    const plain = document.querySelector<HTMLAnchorElement>("#ext-plain")!;
    expect(plain.getAttribute("target")).toBe("_blank");
    expect(plain.getAttribute("rel")).toBe("noopener noreferrer");
    expect(plain.classList.contains("external-link")).toBe(true);

    // 已有 target 不覆盖；rel 缺少 noopener 时重写为安全值
    const withRel = document.querySelector<HTMLAnchorElement>("#ext-rel")!;
    expect(withRel.getAttribute("target")).toBe("_self");
    expect(withRel.getAttribute("rel")).toBe("noopener noreferrer");

    // 已含 noopener 的 rel 原样保留
    const kept = document.querySelector<HTMLAnchorElement>("#ext-kept")!;
    expect(kept.getAttribute("rel")).toBe("noopener");

    const internal = document.querySelector<HTMLAnchorElement>("#internal")!;
    expect(internal.getAttribute("target")).toBeNull();
    expect(internal.getAttribute("rel")).toBeNull();
    expect(internal.classList.contains("external-link")).toBe(false);
  });

  it("嵌入播放器点击/键盘激活为 iframe，重复触发不重建", async () => {
    document.body.innerHTML = [
      "<main class='site-main'><div class='markdown-body'>",
      "<div class='embed-player' id='embed-click' data-embed-src='https://player.example.com/embed/1' data-embed-title='演示视频'></div>",
      "<div class='embed-player' id='embed-key' data-embed-src='https://player.example.com/embed/2'></div>",
      "<div class='embed-player' id='embed-space' data-embed-src='https://player.example.com/embed/3'></div>",
      "</div></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");

    const clickBox = document.querySelector<HTMLElement>("#embed-click")!;
    clickBox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const iframe = clickBox.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("https://player.example.com/embed/1");
    expect(iframe?.getAttribute("title")).toBe("演示视频");
    expect(clickBox.classList.contains("is-active")).toBe(true);

    // 已激活后重复点击不重建 iframe
    clickBox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clickBox.querySelectorAll("iframe").length).toBe(1);

    // 无关按键不激活；Enter 激活并使用默认标题
    const keyBox = document.querySelector<HTMLElement>("#embed-key")!;
    keyBox.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true }));
    expect(keyBox.querySelector("iframe")).toBeNull();
    keyBox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const keyIframe = keyBox.querySelector("iframe");
    expect(keyIframe).not.toBeNull();
    expect(keyIframe?.getAttribute("title")).toBe("Video player");

    // 空格键同样激活
    const spaceBox = document.querySelector<HTMLElement>("#embed-space")!;
    spaceBox.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(spaceBox.querySelector("iframe")).not.toBeNull();
  });

  it("scrollToAnchor 优先采用目标元素 scrollMarginTop 作为顶部偏移", async () => {
    document.body.innerHTML = "<main class='site-main'><h2 id='anchor-target'>目标</h2></main>";
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });

    const target = document.querySelector<HTMLElement>("#anchor-target")!;
    target.getBoundingClientRect = () => ({
      top: 500,
      bottom: 540,
      height: 40,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 500,
      toJSON: () => {},
    });

    const { scrollToAnchor } = await import("../src/scripts/interactions.ts");
    const gosSpy = vi
      .spyOn(window, "getComputedStyle")
      .mockImplementation(() => ({ scrollMarginTop: "96px" }) as unknown as CSSStyleDeclaration);
    try {
      scrollToAnchor(target);
      // targetTop (500) - scrollMarginTop (96) = 404
      expect(scrollTo).toHaveBeenCalledWith({ top: 404, behavior: "smooth" });
    } finally {
      gosSpy.mockRestore();
    }
  });
});

describe("interactions：通知横幅关闭与 BibTeX 复制", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    // 清空语言列表，避免 bootstrap 语言引导在无前缀路由上误触发真实 fetch
    document.documentElement.dataset.siteLangs = "";
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("点击关闭按钮后横幅进入淡出并在 350ms 后从 DOM 移除", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = [
      "<div class='notice-banner visible'>",
      "<button class='notice-banner-close' aria-label='关闭'>×</button>",
      "<span>公告内容</span>",
      "</div>",
      "<main class='site-main'></main>",
    ].join("");

    await import("../src/scripts/interactions.ts");
    const banner = document.querySelector<HTMLElement>(".notice-banner")!;
    document.querySelector<HTMLButtonElement>(".notice-banner-close")!.click();

    expect(banner.classList.contains("dismissing")).toBe(true);
    expect(banner.classList.contains("visible")).toBe(false);

    // jsdom 不触发 transitionend，由 350ms 兜底定时器移除
    await vi.advanceTimersByTimeAsync(350);
    expect(banner.isConnected).toBe(false);
  });

  it("BibTeX 复制成功：写入剪贴板并切换按钮文案，1.8s 后还原", async () => {
    vi.useFakeTimers();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    document.documentElement.dataset.routeLang = "zh";
    document.body.innerHTML = [
      "<div class='publication-item'>",
      "<button type='button' class='publication-copy' data-copy-bibtex='bibtex-p1'>复制 BibTeX</button>",
      "<div class='publication-bibtex'><pre id='bibtex-p1' tabindex='0'>@article{p1, title={T}}</pre></div>",
      "</div>",
    ].join("");

    await import("../src/scripts/interactions.ts");
    const btn = document.querySelector<HTMLButtonElement>(".publication-copy")!;
    btn.click();

    await vi.waitFor(() => {
      expect(btn.textContent).toBe("已复制");
    });
    expect(writeTextMock).toHaveBeenCalledWith("@article{p1, title={T}}");
    expect(btn.getAttribute("aria-live")).toBe("polite");

    await vi.advanceTimersByTimeAsync(1800);
    expect(btn.textContent).toBe("复制 BibTeX");
  });

  it("BibTeX 复制失败：英文页面提示快捷键复制并聚焦源文本", async () => {
    vi.useFakeTimers();
    const writeTextMock = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    document.documentElement.dataset.routeLang = "en";
    document.body.innerHTML = [
      "<div class='publication-item'>",
      "<button type='button' class='publication-copy' data-copy-bibtex='bibtex-p2'>Copy BibTeX</button>",
      "<div class='publication-bibtex'><pre id='bibtex-p2' tabindex='0'>@article{p2}</pre></div>",
      "</div>",
    ].join("");

    await import("../src/scripts/interactions.ts");
    const btn = document.querySelector<HTMLButtonElement>(".publication-copy")!;
    const source = document.querySelector<HTMLElement>("#bibtex-p2")!;
    btn.click();

    await vi.waitFor(() => {
      expect(btn.textContent).toBe("Press Ctrl/Cmd+C");
    });
    expect(document.activeElement).toBe(source);

    await vi.advanceTimersByTimeAsync(1800);
    expect(btn.textContent).toBe("Copy BibTeX");
  });
});

describe("interactions：popstate 回退与语言引导", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    sessionStorage.clear();
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: MockIntersectionObserver,
    });
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("popstate 事件触发不 push 历史的内容交换", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='zh'><head><title>特性</title></head><body>",
      "<main class='site-main'><p>回退后的内容</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => targetHtml }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "zh,en";
    localStorage.setItem("oh-language", "zh");
    document.body.innerHTML = "<main class='site-main'><p>当前页</p></main>";
    history.pushState(null, "", "/features/");

    await import("../src/scripts/interactions.ts");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/features/");
    });
    await vi.waitFor(() => {
      expect(document.querySelector("main.site-main")?.textContent).toBe("回退后的内容");
    });
  });

  it("localStorage 偏好语言与当前路由不一致时，bootstrap 自动交换到偏好语言", async () => {
    const targetHtml = [
      "<!doctype html><html data-route-lang='en'><head><title>Home</title></head><body>",
      "<main class='site-main'><p>English home</p></main>",
      "</body></html>",
    ].join("");
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => targetHtml }));
    vi.stubGlobal("fetch", fetchMock);

    document.documentElement.dataset.routeLang = "zh";
    document.documentElement.dataset.siteLangs = "zh,en";
    localStorage.setItem("oh-language", "en");
    document.body.innerHTML = "<main class='site-main'><p>中文首页</p></main>";
    history.pushState(null, "", "/");

    await import("../src/scripts/interactions.ts");

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/en/");
    });
    await vi.waitFor(() => {
      expect(document.querySelector("main.site-main")?.textContent).toBe("English home");
    });
    expect(document.documentElement.dataset.routeLang).toBe("en");
  });
});

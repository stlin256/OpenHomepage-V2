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
  });

  it("同页锚点链接平滑滚动且不触发 swapContent fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    document.body.innerHTML = [
      "<a id='anchor-link' href='#target-section'>跳到目标</a>",
      "<main class='site-main'><section id='target-section'>目标</section></main>",
    ].join("");
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    await import("../src/scripts/interactions.ts");
    const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector<HTMLAnchorElement>("#anchor-link")!.dispatchEvent(clickEvt);

    expect(clickEvt.defaultPrevented).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(location.hash).toBe("#target-section");
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
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
      "<button class='bgm-drawer-close' aria-label='Close'></button>",
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
      "<button class='bgm-drawer-close' aria-label='关闭'></button>",
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
    expect(document.querySelector<HTMLButtonElement>(".bgm-drawer-close")?.getAttribute("aria-label")).toBe("Close");
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
});

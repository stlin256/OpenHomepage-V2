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
    const animateMock = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
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
});

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
      expect(document.querySelector<HTMLAnchorElement>("#site-title-link")?.getAttribute("href")).toBe("/en/");
    });
    expect(document.querySelector("#site-title-link")?.textContent).toBe("English Site");
  });
});

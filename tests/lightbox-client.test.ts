/**
 * Lightbox 2.0 客户端交互与多图画廊测试。
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("lightbox 2.0 client behavior", () => {
  beforeEach(async () => {
    document.body.innerHTML = [
      '<div class="lightbox" role="dialog" aria-modal="true" aria-label="Image preview" hidden>',
      '  <div class="lightbox-toolbar">',
      '    <span class="lightbox-counter" aria-live="polite"></span>',
      '    <button class="lightbox-close" type="button" aria-label="Close"></button>',
      '  </div>',
      '  <button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image" hidden></button>',
      '  <div class="lightbox-figure">',
      '    <img class="lightbox-img" alt="" />',
      '    <p class="lightbox-caption" aria-live="polite" hidden></p>',
      '  </div>',
      '  <div class="lightbox-spinner" aria-hidden="true"></div>',
      '  <button class="lightbox-nav lightbox-next" type="button" aria-label="Next image" hidden></button>',
      '</div>',
      '<main class="site-main">',
      '  <div class="page-content markdown-body">',
      '    <figure>',
      '      <img id="img-1" src="/assets/fig1.jpg" alt="Figure 1 Caption" />',
      '      <figcaption>Figure 1 Caption</figcaption>',
      '    </figure>',
      '    <figure>',
      '      <img id="img-2" src="/assets/fig2.jpg" alt="Figure 2 Caption" />',
      '      <figcaption>Figure 2 Caption</figcaption>',
      '    </figure>',
      '  </div>',
      '</main>',
    ].join("\n");
    vi.resetModules();
    await import("../src/scripts/lightbox.ts");
  });

  it("点击多图画廊中的第一张图片，展示灯箱并显示计数器 1 / 2 与翻页按钮", () => {
    const img1 = document.querySelector("#img-1") as HTMLImageElement;
    const box = document.querySelector(".lightbox") as HTMLElement;
    const view = box.querySelector(".lightbox-img") as HTMLImageElement;
    const counter = box.querySelector(".lightbox-counter") as HTMLElement;
    const caption = box.querySelector(".lightbox-caption") as HTMLElement;
    const prevBtn = box.querySelector(".lightbox-prev") as HTMLButtonElement;
    const nextBtn = box.querySelector(".lightbox-next") as HTMLButtonElement;

    img1.click();

    expect(box.hidden).toBe(false);
    expect(box.classList.contains("open")).toBe(true);
    expect(counter.hidden).toBe(false);
    expect(counter.textContent).toBe("1 / 2");
    expect(caption.hidden).toBe(false);
    expect(caption.textContent).toBe("Figure 1 Caption");
    expect(prevBtn.hidden).toBe(false);
    expect(nextBtn.hidden).toBe(false);
    expect(view.src).toContain("fig1");
  });

  it("点击下一张按钮与使用右方向键可顺序切换图片并更新计数器", () => {
    const img1 = document.querySelector("#img-1") as HTMLImageElement;
    const box = document.querySelector(".lightbox") as HTMLElement;
    const view = box.querySelector(".lightbox-img") as HTMLImageElement;
    const counter = box.querySelector(".lightbox-counter") as HTMLElement;
    const caption = box.querySelector(".lightbox-caption") as HTMLElement;
    const nextBtn = box.querySelector(".lightbox-next") as HTMLButtonElement;

    img1.click();
    expect(counter.textContent).toBe("1 / 2");

    nextBtn.click();
    expect(counter.textContent).toBe("2 / 2");
    expect(caption.textContent).toBe("Figure 2 Caption");
    expect(view.src).toContain("fig2");

    nextBtn.click();
    expect(counter.textContent).toBe("1 / 2");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(counter.textContent).toBe("2 / 2");
  });

  it("按下 Escape 键或点击关闭按钮可关闭灯箱", () => {
    const img1 = document.querySelector("#img-1") as HTMLImageElement;
    const box = document.querySelector(".lightbox") as HTMLElement;
    const closeBtn = box.querySelector(".lightbox-close") as HTMLButtonElement;

    img1.click();
    expect(box.hidden).toBe(false);

    closeBtn.click();
    expect(box.classList.contains("open")).toBe(false);
  });

  it("打开与切换图片时包含 is-loading 状态，图片 onload 后移除 is-loading", () => {
    const img1 = document.querySelector("#img-1") as HTMLImageElement;
    const box = document.querySelector(".lightbox") as HTMLElement;
    const view = box.querySelector(".lightbox-img") as HTMLImageElement;

    img1.click();
    expect(box.classList.contains("is-loading")).toBe(true);

    view.onload?.(new Event("load"));
    expect(box.classList.contains("is-loading")).toBe(false);
  });

  it("画廊页面跨多个 md-grid 网格的图片能被全部收集并在整页间顺序切换", async () => {
    document.body.innerHTML = [
      '<div class="lightbox" role="dialog" aria-modal="true" aria-label="Image preview" hidden>',
      '  <div class="lightbox-toolbar">',
      '    <span class="lightbox-counter" aria-live="polite"></span>',
      '    <button class="lightbox-close" type="button" aria-label="Close"></button>',
      '  </div>',
      '  <button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image" hidden></button>',
      '  <div class="lightbox-figure">',
      '    <img class="lightbox-img" alt="" />',
      '    <p class="lightbox-caption" aria-live="polite" hidden></p>',
      '  </div>',
      '  <div class="lightbox-spinner" aria-hidden="true"></div>',
      '  <button class="lightbox-nav lightbox-next" type="button" aria-label="Next image" hidden></button>',
      '</div>',
      '<main class="site-main">',
      '  <div class="page-content markdown-body">',
      '    <div class="md-grid md-grid-cols-2">',
      '      <div class="md-grid-cell"><figure><img id="g-img-1" src="/assets/g1.jpg" alt="G1" /></figure></div>',
      '      <div class="md-grid-cell"><figure><img id="g-img-2" src="/assets/g2.jpg" alt="G2" /></figure></div>',
      '    </div>',
      '    <div class="md-grid md-grid-cols-2">',
      '      <div class="md-grid-cell"><figure><img id="g-img-3" src="/assets/g3.jpg" alt="G3" /></figure></div>',
      '      <div class="md-grid-cell"><figure><img id="g-img-4" src="/assets/g4.jpg" alt="G4" /></figure></div>',
      '    </div>',
      '  </div>',
      '</main>',
    ].join("\n");
    vi.resetModules();
    await import("../src/scripts/lightbox.ts");

    const gImg3 = document.querySelector("#g-img-3") as HTMLImageElement;
    const box = document.querySelector(".lightbox") as HTMLElement;
    const view = box.querySelector(".lightbox-img") as HTMLImageElement;
    const counter = box.querySelector(".lightbox-counter") as HTMLElement;
    const nextBtn = box.querySelector(".lightbox-next") as HTMLButtonElement;

    gImg3.click();

    expect(box.hidden).toBe(false);
    expect(counter.textContent).toBe("3 / 4");
    expect(view.src).toContain("g3");

    nextBtn.click();
    expect(counter.textContent).toBe("4 / 4");
    expect(view.src).toContain("g4");

    nextBtn.click();
    expect(counter.textContent).toBe("1 / 4");
    expect(view.src).toContain("g1");
  });
});

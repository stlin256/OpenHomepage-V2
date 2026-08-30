// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { filterSearchResults, type SearchResultItem, buildSearchIndexItem, getSearchI18n } from "../src/lib/search.ts";
import { generateSiteSearchIndex } from "../src/lib/search-index.ts";

const sampleResults: SearchResultItem[] = [
  {
    id: "p1",
    url: "/research",
    title: "系统架构与高性能推断",
    excerpt: "针对大模型推理的高性能自适应调度器架构设计与实现",
    lang: "zh",
  },
  {
    id: "p2",
    url: "/en/research",
    title: "High Performance Inference Systems",
    excerpt: "Adaptive scheduler architecture and benchmarks for LLM inference",
    lang: "en",
  },
  {
    id: "p3",
    url: "/features",
    title: "Features · 特性总览",
    excerpt: "探索 OpenHomepage-V2 杂志风排版、学术发表列表与时间线组件",
    lang: "zh",
  },
  {
    id: "p4",
    url: "/features#reading-progress",
    title: "阅读进度条 · 特性",
    excerpt: "顶部细线阅读进度指示，实时响应页面滚动位置",
    lang: "zh",
  },
];

describe("filterSearchResults", () => {
  it("filters results by search query in title and excerpt (case-insensitive)", () => {
    const res = filterSearchResults(sampleResults, "inference", { lang: "all" });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("p2");
  });

  it("handles CJK queries across title and excerpt", () => {
    const res = filterSearchResults(sampleResults, "调度器", { lang: "all" });
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe("p1");
  });

  it("handles multi-token searches and headings", () => {
    const res = filterSearchResults(sampleResults, "阅读 进度条", { lang: "zh" });
    expect(res.length).toBeGreaterThanOrEqual(1);
    expect(res[0].id).toBe("p4");
  });

  it("filters by language scope when not all", () => {
    const zhOnly = filterSearchResults(sampleResults, "系统", { lang: "zh" });
    expect(zhOnly).toHaveLength(1);
    expect(zhOnly[0].lang).toBe("zh");

    const enScope = filterSearchResults(sampleResults, "系统", { lang: "en" });
    expect(enScope).toHaveLength(0);
  });

  it("returns empty array for empty query or whitespace", () => {
    expect(filterSearchResults(sampleResults, "   ", { lang: "all" })).toEqual([]);
  });
});

describe("buildSearchIndexItem", () => {
  it("strips HTML tags and data-pagefind-ignore sections from excerpt", () => {
    const rawHtml = `<h1>Title</h1><p>Main content <pre data-pagefind-ignore>@article{ignore, me=1}</pre> and more text.</p>`;
    const item = buildSearchIndexItem({
      url: "/test",
      title: "Title",
      html: rawHtml,
      lang: "zh",
    });
    expect(item.excerpt).toContain("Main content");
    expect(item.excerpt).toContain("and more text.");
    expect(item.excerpt).not.toContain("@article");
  });
});

describe("generateSiteSearchIndex", () => {
  it("extracts pages, headings, callouts and publications across data directory", () => {
    const index = generateSiteSearchIndex("data");
    expect(index.length).toBeGreaterThan(10);
    const headings = index.filter((item) => item.url.includes("#"));
    expect(headings.length).toBeGreaterThan(5);
  });
});

describe("getSearchI18n", () => {
  it("provides localized strings for zh, en, ja, fr and falls back to zh", () => {
    const zh = getSearchI18n("zh");
    expect(zh.scopeCurrent).toBe("当前语言");
    expect(zh.statusMatches(3)).toBe("找到 3 条结果");

    const en = getSearchI18n("en");
    expect(en.scopeCurrent).toBe("This language");
    expect(en.statusMatches(3)).toBe("3 matches found");

    const ja = getSearchI18n("ja");
    expect(ja.scopeCurrent).toBe("現在の言語");

    const fallback = getSearchI18n("es");
    expect(fallback.scopeCurrent).toBe("当前语言");
  });
});

describe("initSearch client interactions", () => {
  it("opens and closes modal with animation classes, supports clear button and scope toggling", async () => {
    const { initSearch } = await import("../src/scripts/search.ts");
    document.body.innerHTML = `
      <button class='search-toggle' type='button' aria-label='Search'></button>
      <dialog class='search-dialog' hidden>
        <div class='search-panel'>
          <form class='search-form'>
            <div class='search-input-wrapper'>
              <input type='search' class='search-input' />
              <button type='button' class='search-clear-btn' hidden>✕</button>
            </div>
            <button type='button' class='search-scope-toggle' data-scope='current' aria-pressed='false'>当前语言</button>
            <button type='button' class='search-close'>Esc</button>
          </form>
          <p class='search-status'></p>
          <ul class='search-results'></ul>
          <div class='search-footer'>
            <span class='search-hint-nav'></span>
            <span class='search-hint-select'></span>
            <span class='search-hint-close'></span>
          </div>
        </div>
      </dialog>
    `;
    const dialog = document.querySelector(".search-dialog") as any;
    dialog.showModal = function () {
      this.open = true;
    };
    dialog.close = function () {
      this.open = false;
    };

    initSearch();
    const toggle = document.querySelector(".search-toggle") as HTMLButtonElement;
    const closeBtn = document.querySelector(".search-close") as HTMLButtonElement;
    const clearBtn = document.querySelector(".search-clear-btn") as HTMLButtonElement;
    const input = document.querySelector(".search-input") as HTMLInputElement;
    const scopeToggle = document.querySelector(".search-scope-toggle") as HTMLButtonElement;

    // Open modal
    toggle.click();
    expect(dialog.hidden).toBe(false);

    // Typing in search input toggles clear button
    input.value = "test";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(clearBtn.hidden).toBe(false);

    // Clicking clear button clears input and hides itself
    clearBtn.click();
    expect(input.value).toBe("");
    expect(clearBtn.hidden).toBe(true);

    // Scope toggling: 单按钮在 current / all 间切换
    scopeToggle.click();
    expect(scopeToggle.dataset.scope).toBe("all");
    expect(scopeToggle.getAttribute("aria-pressed")).toBe("true");

    scopeToggle.click();
    expect(scopeToggle.dataset.scope).toBe("current");
    expect(scopeToggle.getAttribute("aria-pressed")).toBe("false");

    // Close modal
    closeBtn.click();
    expect(dialog.classList.contains("closing")).toBe(true);
    expect(dialog.classList.contains("open")).toBe(false);
  });
});

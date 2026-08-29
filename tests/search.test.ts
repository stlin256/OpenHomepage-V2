// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { filterSearchResults, type SearchResultItem, buildSearchIndexItem, getSearchI18n } from "../src/lib/search.ts";

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
  it("opens and closes modal with animation classes and supports scope toggling", async () => {
    const { initSearch } = await import("../src/scripts/search.ts");
    document.body.innerHTML = "<button class='search-toggle' type='button' aria-label='Search'></button><dialog class='search-dialog' hidden><div class='search-panel'><form class='search-form'><input type='search' class='search-input' /><div class='search-scope-tabs'><button type='button' class='search-scope-btn active' data-scope='current'>当前语言</button><button type='button' class='search-scope-btn' data-scope='all'>全部语言</button></div><button type='button' class='search-close'>Esc</button></form><p class='search-status'></p><ul class='search-results'></ul><div class='search-footer'><span class='search-hint-nav'></span><span class='search-hint-select'></span><span class='search-hint-close'></span></div></div></dialog>";
    const dialog = document.querySelector(".search-dialog");
    dialog.showModal = function () {
      this.open = true;
    };
    dialog.close = function () {
      this.open = false;
    };

    initSearch();
    const toggle = document.querySelector(".search-toggle");
    const closeBtn = document.querySelector(".search-close");
    const currentBtn = document.querySelector(".search-scope-btn[data-scope='current']");
    const allBtn = document.querySelector(".search-scope-btn[data-scope='all']");

    // Open modal
    toggle.click();
    expect(dialog.hidden).toBe(false);

    // Scope toggling
    allBtn.click();
    expect(allBtn.classList.contains("active")).toBe(true);
    expect(currentBtn.classList.contains("active")).toBe(false);

    currentBtn.click();
    expect(currentBtn.classList.contains("active")).toBe(true);
    expect(allBtn.classList.contains("active")).toBe(false);

    // Close modal
    closeBtn.click();
    expect(dialog.classList.contains("closing")).toBe(true);
    expect(dialog.classList.contains("open")).toBe(false);
  });
});

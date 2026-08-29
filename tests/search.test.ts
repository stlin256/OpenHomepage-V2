import { describe, it, expect } from "vitest";
import { filterSearchResults, type SearchResultItem, buildSearchIndexItem } from "../src/lib/search.ts";

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

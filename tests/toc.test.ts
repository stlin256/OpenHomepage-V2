import { describe, it, expect } from "vitest";
import { extractToc, shouldEnableToc, generateHeadingSlug, renderTocHtml } from "../src/lib/toc.ts";

describe("generateHeadingSlug", () => {
  it("generates clean slugs and handles duplicate headings", () => {
    const existing = new Set<string>();
    const s1 = generateHeadingSlug("Introduction to System", existing);
    const s2 = generateHeadingSlug("Introduction to System", existing);
    const s3 = generateHeadingSlug("Introduction to System", existing);
    expect(s1).toBe("introduction-to-system");
    expect(s2).toBe("introduction-to-system-2");
    expect(s3).toBe("introduction-to-system-3");
  });

  it("handles CJK characters and symbols gracefully", () => {
    const existing = new Set<string>();
    const slug = generateHeadingSlug("系统架构 & 性能优化 (2026)", existing);
    expect(slug).toContain("系统架构");
    expect(slug).toContain("性能优化");
    expect(slug).not.toContain("&");
  });

  it("handles empty / punctuation-only headings", () => {
    const existing = new Set<string>();
    const slug = generateHeadingSlug("??? ...", existing, 1);
    expect(slug).toBe("section-1");
  });
});

describe("shouldEnableToc", () => {
  it("respects explicit boolean settings", () => {
    expect(shouldEnableToc(true, 100, 1)).toBe(true);
    expect(shouldEnableToc(false, 5000, 10)).toBe(false);
  });

  it("auto mode enables when word count >= 1800 or headings >= 4", () => {
    expect(shouldEnableToc("auto", 1850, 2)).toBe(true);
    expect(shouldEnableToc("auto", 500, 4)).toBe(true);
    expect(shouldEnableToc("auto", 500, 2)).toBe(false);
    expect(shouldEnableToc(undefined, 500, 2)).toBe(false);
  });
});

describe("extractToc", () => {
  it("extracts hierarchical headings up to maxDepth and injects ids", () => {
    const md = [
      "# Title (H1 ignored)",
      "",
      "## Section One",
      "Some text here.",
      "",
      "### Subsection A",
      "More text.",
      "",
      "## Section Two",
      "### Subsection B",
      "#### Deep H4",
    ].join("\n");

    const items = extractToc(md, { maxDepth: 3 });
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ depth: 2, text: "Section One", slug: "section-one", id: "section-one" });
    expect(items[1]).toEqual({ depth: 3, text: "Subsection A", slug: "subsection-a", id: "subsection-a" });
    expect(items[2]).toEqual({ depth: 2, text: "Section Two", slug: "section-two", id: "section-two" });
    expect(items[3]).toEqual({ depth: 3, text: "Subsection B", slug: "subsection-b", id: "subsection-b" });
  });

  it("renders semantic HTML with data-pagefind-ignore", () => {
    const items = [
      { depth: 2, text: "Alpha", slug: "alpha", id: "alpha" },
      { depth: 3, text: "Beta", slug: "beta", id: "beta" },
    ];
    const html = renderTocHtml(items, { title: "Table of Contents" });
    expect(html).toContain("data-pagefind-ignore");
    expect(html).toContain('href="#alpha"');
    expect(html).toContain('href="#beta"');
    expect(html).toContain('class="toc"');
  });
});

describe("markdown heading slugs integration", () => {
  it("renders h2/h3 headings with stable ids matching toc", async () => {
    const { renderMarkdown } = await import("../src/lib/markdown.ts");
    const html = await renderMarkdown("## Section One\n\n### Subsection A", { headingSlugs: true });
    expect(html).toContain('<h2 id="section-one">Section One</h2>');
    expect(html).toContain('<h3 id="subsection-a">Subsection A</h3>');
  }, 60000);
});


import { describe, it, expect } from "vitest";
import {
  normalizeOgConfig,
  computeOgHash,
  generateOgSvg,
  resolvePageOgMeta,
} from "../src/lib/og-image.ts";

describe("normalizeOgConfig", () => {
  it("normalizes default settings", () => {
    const cfg = normalizeOgConfig(undefined);
    expect(cfg.enabled).toBe(true);
    expect(cfg.layout).toBe("editorial");
    expect(cfg.format).toBe("png");
    expect(cfg.cache).toBe(true);
  });

  it("respects explicit disabled flag", () => {
    expect(normalizeOgConfig({ enabled: false }).enabled).toBe(false);
  });
});

describe("computeOgHash", () => {
  it("produces deterministic hash for identical parameters", () => {
    const h1 = computeOgHash({ title: "Page A", description: "Desc A", siteTitle: "Site", lang: "zh", accent: "#3a7bd5" });
    const h2 = computeOgHash({ title: "Page A", description: "Desc A", siteTitle: "Site", lang: "zh", accent: "#3a7bd5" });
    const h3 = computeOgHash({ title: "Page B", description: "Desc A", siteTitle: "Site", lang: "zh", accent: "#3a7bd5" });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[a-f0-9]{12,32}$/);
  });
});

describe("generateOgSvg", () => {
  it("generates 1200x630 valid SVG markup with escaped texts", () => {
    const svg = generateOgSvg({
      title: "Research & Systems",
      description: "Fast & scalable systems <design>",
      siteTitle: "Zhiyuan's Homepage",
      accent: "#3a7bd5",
      background: "#f8f7f2",
      lang: "en",
    });
    expect(svg).toContain('viewBox="0 0 1200 630"');
    expect(svg).toContain('Research &amp; Systems');
    expect(svg).toContain('Fast &amp; scalable systems &lt;design&gt;');
    expect(svg).toContain('#3a7bd5');
  });
});

describe("resolvePageOgMeta", () => {
  it("uses frontmatter override if specified", () => {
    const meta = resolvePageOgMeta({
      page: {
        title: "Page",
        body: "",
        filePath: "",
        lang: "zh",
        nav: true,
        slug: "/custom",
        ogImage: "assets/social/custom.png",
        ogTitle: "Custom OG Title",
        ogDescription: "Custom Desc",
      } as any,
      siteTitle: "My Site",
      baseUrl: "https://example.com/base/",
    });
    expect(meta.title).toBe("Custom OG Title");
    expect(meta.description).toBe("Custom Desc");
    expect(meta.imageUrl).toBe("https://example.com/base/assets/social/custom.png");
  });
});

/**
 * OG 分享卡按需预览（spec 21 §5）：不跑构建、不写盘、不依赖 sharp，
 * 用与 scripts/generate-og-images.ts 相同的输入（标题/描述/站点名/语言/主题色）
 * 调用 src/lib/og-image.ts 的 generateOgSvg，返回 SVG 供浏览器直接查看。
 * 页面 frontmatter 自定义了 og_image 时不生成（与构建期跳过逻辑一致），回传该路径。
 */
import path from 'node:path';
import { loadSiteConfig, loadPages, resolveText } from '../../src/lib/config.ts';
import { normalizeLang } from '../../src/lib/routes.ts';
import { generateOgSvg } from '../../src/lib/og-image.ts';

export interface OgPreviewResult {
  /** 页面自定义 og_image 的路径（此时 svg 为 null） */
  custom: string | null;
  svg: string | null;
  title: string;
}

export function renderOgPreview(dataDir: string, lang: string, file: string): OgPreviewResult {
  // file 只允许裸文件名（basename 比对防路径穿越）
  if (!lang || !file || !file.endsWith('.md') || file !== path.basename(file)) {
    throw new Error('非法的页面参数：需要 lang 与 <file>.md');
  }
  const site = loadSiteConfig(dataDir);
  const pages = loadPages(dataDir);
  const page = pages.find((p) => p.lang === lang && path.basename(p.filePath) === file);
  if (!page) throw new Error(`页面不存在：${lang}/${file}`);
  if (page.ogImage) return { custom: page.ogImage, svg: null, title: page.title };

  // 与 generate-og-images.ts 同一套输入
  const langs = [...new Set(pages.map((p) => p.lang))];
  const defaultLang = normalizeLang(site.site.language) ?? langs[0] ?? 'zh';
  const siteTitle = resolveText(site.site.title, page.lang, defaultLang);
  const title = page.ogTitle || page.title;
  const description =
    page.ogDescription ||
    page.description ||
    (site.site.description ? resolveText(site.site.description, page.lang, defaultLang) : '');
  const svg = generateOgSvg({
    title,
    description,
    siteTitle,
    accent: site.theme?.accent || '#3a7bd5',
    background: site.theme?.background || '#f8f7f2',
    lang: page.lang,
  });
  return { custom: null, svg, title };
}

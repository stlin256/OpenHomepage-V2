/**
 * 全站静态搜索索引生成器：构建期提取所有页面、标题、区块、学术论文、时间线与组件内容。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadPages, detectLanguages, loadSiteConfig, resolveText, type PageEntry } from './config.ts';
import { buildRoutes, normalizeLang, pageUrlPath, type RouteEntry } from './routes.ts';
import { loadPublications } from './publications.ts';
import { generateHeadingSlug } from './toc.ts';
import type { SearchResultItem } from './search.ts';

function cleanMarkdown(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ') // code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!\[.*?\]\(.*?\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1') // link text
    .replace(/\{#[^}]+\}/g, '') // custom {#id}
    .replace(/:::?[a-zA-Z0-9_-]+(?:\{[^}]*\})?/g, ' ') // directives :::note{title="..."} or ::ghcard{}
    .replace(/:::+/g, ' ')
    .replace(/<[^>]+>/g, ' ') // html tags
    .replace(/[*_~#|>-]/g, ' ') // markdown symbols
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHeading(raw: string): string {
  return raw
    .replace(/\{#[^}]+\}/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export function generateSiteSearchIndex(dataDir: string): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const seenIds = new Set<string>();

  const pushItem = (item: SearchResultItem) => {
    const key = `${item.lang}:${item.url}:${item.title}`;
    if (seenIds.has(key)) return;
    seenIds.add(key);
    items.push(item);
  };

  const pages = loadPages(dataDir);
  if (pages.length === 0) return items;

  const langs = detectLanguages(pages);
  const siteConfig = loadSiteConfig(dataDir);
  const defaultLang = normalizeLang(siteConfig.site.language) ?? langs[0];
  const routes = buildRoutes(pages, langs, defaultLang);

  // 1. Index each route (Page + Headings + Sections + Directives)
  for (const route of routes) {
    const page = route.page;
    const cleanBody = cleanMarkdown(page.body);
    const firstSnippet = cleanBody.slice(0, 200);

    // 1a. Page item
    pushItem({
      id: route.path,
      url: route.path,
      title: page.title,
      excerpt: page.description ? `${page.description} - ${firstSnippet}` : firstSnippet,
      lang: route.lang,
    });

    // 1b. Markdown headings (H1 - H6)
    const existingSlugs = new Set<string>();
    const headingRe = /^(#{1,6})\s+(.+)$/gm;
    const bodyText = page.body;

    const headingMatches: { headingText: string; rawText: string; slug: string; index: number; linePos: number }[] = [];
    let hMatch: RegExpExecArray | null;
    let hIdx = 1;

    while ((hMatch = headingRe.exec(bodyText)) !== null) {
      const rawText = hMatch[2].trim();
      const customIdMatch = rawText.match(/\{#([a-zA-Z0-9-_]+)\}/);
      let slug: string;
      if (customIdMatch) {
        slug = customIdMatch[1];
        existingSlugs.add(slug);
      } else {
        slug = generateHeadingSlug(rawText, existingSlugs, hIdx);
      }
      const headingText = cleanHeading(rawText);
      if (headingText) {
        headingMatches.push({
          headingText,
          rawText,
          slug,
          index: hIdx,
          linePos: hMatch.index + hMatch[0].length,
        });
      }
      hIdx++;
    }

    for (let i = 0; i < headingMatches.length; i++) {
      const curr = headingMatches[i];
      const nextPos = i + 1 < headingMatches.length ? headingMatches[i + 1].linePos - headingMatches[i + 1].rawText.length - 10 : bodyText.length;
      const sectionContent = bodyText.slice(curr.linePos, nextPos);
      const cleanSection = cleanMarkdown(sectionContent);

      pushItem({
        id: `${route.path}#${curr.slug}`,
        url: `${route.path}#${curr.slug}`,
        title: `${curr.headingText} · ${page.title}`,
        excerpt: cleanSection.slice(0, 260) || curr.headingText,
        lang: route.lang,
      });
    }

    // 1c. Callouts inside page
    const calloutRe = /:::(?:note|tip|warning|quote|important)\s*\{title="([^"]+)"(?:\s*source="([^"]+)")?\}[\r\n]+([\s\S]*?):::/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = calloutRe.exec(bodyText)) !== null) {
      const cTitle = cMatch[1].trim();
      const cBody = cleanMarkdown(cMatch[3]);
      pushItem({
        id: `${route.path}#callout-${cTitle}`,
        url: route.path,
        title: `${cTitle} · ${page.title}`,
        excerpt: cBody.slice(0, 220),
        lang: route.lang,
      });
    }

    // 1d. Timeline items inside page
    const timelineRe = /:::timeline-item\s*\{[^}]*title="([^"]+)"(?:[^}]*org="([^"]+)")?[^}]*\}[\r\n]+([\s\S]*?):::/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = timelineRe.exec(bodyText)) !== null) {
      const tTitle = tMatch[1].trim();
      const tOrg = (tMatch[2] || '').trim();
      const tBody = cleanMarkdown(tMatch[3]);
      pushItem({
        id: `${route.path}#timeline-${tTitle}`,
        url: route.path,
        title: tOrg ? `${tTitle} (${tOrg}) · ${page.title}` : `${tTitle} · ${page.title}`,
        excerpt: tBody.slice(0, 220),
        lang: route.lang,
      });
    }
  }

  // 2. Profile block
  for (const lang of langs) {
    const profName = resolveText(siteConfig.profile.name, lang, defaultLang);
    const profTagline = resolveText(siteConfig.profile.tagline, lang, defaultLang);
    const siteTitle = resolveText(siteConfig.site.title, lang, defaultLang);
    const siteDesc = resolveText(siteConfig.site.description, lang, defaultLang);
    const homeUrl = pageUrlPath('/', lang, defaultLang);

    if (profName) {
      pushItem({
        id: `${homeUrl}#profile`,
        url: homeUrl,
        title: `${profName} · ${siteTitle || 'Profile'}`,
        excerpt: profTagline ? `${profTagline} ${siteDesc || ''}` : siteDesc || profName,
        lang,
      });
    }
  }

  // 3. Publications
  try {
    const publications = loadPublications(dataDir);
    if (publications && publications.items) {
      for (const pub of publications.items) {
        for (const lang of langs) {
          const researchPath = pageUrlPath('research', lang, defaultLang);
          const authors = pub.authors ? pub.authors.join(', ') : '';
          const venue = pub.venue || '';
          const year = pub.year ? String(pub.year) : '';
          const abstract = resolveText(pub.abstract, lang, defaultLang) || '';
          const note = resolveText(pub.note, lang, defaultLang) || '';
          const tags = pub.tags ? pub.tags.join(' ') : '';
          const excerpt = [authors, year, venue, abstract, note, tags].filter(Boolean).join(' - ');

          pushItem({
            id: `${researchPath}#pub-${pub.id || pub.title}`,
            url: researchPath,
            title: `${pub.title} (${year || 'Paper'})`,
            excerpt: excerpt.slice(0, 280),
            lang,
          });
        }
      }
    }
  } catch {
    /* ignore publications load errors */
  }

  return items;
}

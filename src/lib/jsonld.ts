/**
 * spec 24: 学术与个人结构化数据（Schema.org / JSON-LD）纯函数生成层
 * 构建期将学者资料、学术成果与文章元数据转为合规且 XSS 安全的 JSON-LD。
 */
import type { PageEntry, SiteConfig } from './config.ts';
import { resolveText } from './localize.ts';
import type { PublicationsConfig, PublicationItem } from './publications.ts';
import { resolveAbsoluteUrl } from './sitemap.ts';
import { pageUrlPath } from './routes.ts';

export interface JsonLdOptions {
  site: SiteConfig;
  page: PageEntry;
  publications?: PublicationsConfig;
  lang: string;
  defaultLang: string;
  siteUrl?: string | URL;
  baseUrl?: string;
  isHome?: boolean;
}

/** 剥离 Markdown 符号与 HTML 标签，提取用于摘要的纯文本 */
export function stripMarkdownAndHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/:::[^\n]*/g, '')
    .replace(/::[a-zA-Z0-9_-]+(\{[^}]*\})?/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 安全序列化 JSON-LD：严格转义危险字符，杜绝脚本逃逸 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function resolveAvatarFullUrl(
  avatar?: string,
  siteUrl?: string | URL,
  baseUrl?: string,
): string | undefined {
  if (!avatar) return undefined;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  const clean = avatar.startsWith('/') ? avatar : `/${avatar}`;
  return resolveAbsoluteUrl(clean, siteUrl, baseUrl);
}

export function buildWebSiteSchema(
  site: SiteConfig,
  lang: string,
  defaultLang: string,
  siteDomain: string,
): Record<string, unknown> {
  const title = resolveText(site.site.title, lang, defaultLang);
  const description = site.site.description
    ? resolveText(site.site.description, lang, defaultLang)
    : undefined;

  return {
    '@type': 'WebSite',
    '@id': `${siteDomain}/#website`,
    url: `${siteDomain}/`,
    name: title,
    ...(description ? { description } : {}),
    inLanguage: lang,
  };
}

export function buildPersonSchema(
  site: SiteConfig,
  publications: PublicationsConfig | undefined,
  lang: string,
  defaultLang: string,
  siteDomain: string,
  baseUrl?: string,
): Record<string, unknown> {
  const name = resolveText(site.profile.name, lang, defaultLang);
  const jobTitle = site.profile.tagline
    ? resolveText(site.profile.tagline, lang, defaultLang)
    : undefined;
  const image = resolveAvatarFullUrl(site.profile.avatar, siteDomain, baseUrl);

  const sameAsSet = new Set<string>();
  if (site.profile.links) {
    for (const l of site.profile.links) {
      if (l.url && (/^https?:\/\//i.test(l.url) || l.url.startsWith('mailto:'))) {
        sameAsSet.add(l.url);
      }
    }
  }
  if (site.github?.username) {
    sameAsSet.add(`https://github.com/${site.github.username}`);
  }
  const sameAs = Array.from(sameAsSet);

  const knowsAboutSet = new Set<string>();
  if (publications?.enabled !== false && publications?.items) {
    for (const item of publications.items) {
      if (item.tags) {
        for (const t of item.tags) {
          if (typeof t === 'string' && t.trim()) knowsAboutSet.add(t.trim());
        }
      }
    }
  }
  const knowsAbout = Array.from(knowsAboutSet);

  return {
    '@type': 'Person',
    '@id': `${siteDomain}/#person`,
    name,
    ...(jobTitle ? { jobTitle } : {}),
    ...(image ? { image } : {}),
    url: `${siteDomain}/`,
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(knowsAbout.length > 0 ? { knowsAbout } : {}),
  };
}

export function buildScholarlyArticleSchema(
  item: PublicationItem,
  lang: string,
  defaultLang: string,
  siteDomain: string,
): Record<string, unknown> {
  const datePublished = item.date || (item.year ? String(item.year) : undefined);
  const note = item.note ? resolveText(item.note, lang, defaultLang) : undefined;
  const abstractText = item.abstract ? resolveText(item.abstract, lang, defaultLang) : undefined;
  const doiUrl = item.doi ? (item.doi.startsWith('http') ? item.doi : `https://doi.org/${item.doi}`) : undefined;
  const primaryUrl = item.links?.pdf || item.links?.arxiv || item.links?.project || doiUrl;

  let isPartOf: Record<string, unknown> | undefined;
  if (item.venue) {
    isPartOf = {
      '@type': item.type === 'journal' ? 'Periodical' : 'PublicationEvent',
      name: item.venue,
    };
  }

  return {
    '@type': 'ScholarlyArticle',
    '@id': `${siteDomain}/#pub-${item.id}`,
    headline: item.title,
    name: item.title,
    author: item.authors.map((authorName) => ({
      '@type': 'Person',
      name: authorName,
    })),
    ...(datePublished ? { datePublished } : {}),
    ...(isPartOf ? { isPartOf } : {}),
    ...(doiUrl ? { sameAs: doiUrl, identifier: item.doi } : {}),
    ...(note ? { description: note } : {}),
    ...(abstractText ? { abstract: abstractText } : {}),
    ...(primaryUrl ? { url: primaryUrl } : {}),
    ...(item.tags && item.tags.length > 0 ? { keywords: item.tags } : {}),
  };
}

export function buildArticleSchema(
  page: PageEntry,
  site: SiteConfig,
  lang: string,
  defaultLang: string,
  siteDomain: string,
  baseUrl?: string,
): Record<string, unknown> {
  const pagePath = pageUrlPath(page.slug, lang, defaultLang);
  const pageUrl = resolveAbsoluteUrl(pagePath, siteDomain, baseUrl);
  const isPostOrArticle = page.type === 'post' || page.type === 'article' || Boolean(page.date);
  const type = page.type === 'post' ? 'BlogPosting' : isPostOrArticle ? 'Article' : 'WebPage';
  const authorName = resolveText(site.profile.name, lang, defaultLang);
  const description = page.description || (page.body ? stripMarkdownAndHtml(page.body).slice(0, 200) : undefined);

  return {
    '@type': type,
    '@id': `${pageUrl}#${type.toLowerCase()}`,
    isPartOf: { '@id': `${siteDomain}/#website` },
    headline: page.title,
    inLanguage: lang,
    mainEntityOfPage: pageUrl,
    ...(page.date ? { datePublished: page.date } : {}),
    ...(page.updated || page.date ? { dateModified: page.updated ?? page.date } : {}),
    ...(description ? { description } : {}),
    author: {
      '@type': 'Person',
      name: authorName,
    },
  };
}

export function buildPageJsonLd(options: JsonLdOptions): Record<string, unknown> {
  const { site, page, publications, lang, defaultLang, siteUrl, baseUrl, isHome } = options;
  const siteDomain = (siteUrl ? (typeof siteUrl === 'string' ? siteUrl : siteUrl.toString()) : (site.site.url ?? 'https://example.com')).replace(/\/+$/, '');

  const website = buildWebSiteSchema(site, lang, defaultLang, siteDomain);
  const graph: Record<string, unknown>[] = [website];

  if (isHome) {
    const person = buildPersonSchema(site, publications, lang, defaultLang, siteDomain, baseUrl);
    const profilePage = {
      '@type': 'ProfilePage',
      '@id': `${siteDomain}/#profilepage`,
      url: `${siteDomain}/`,
      name: resolveText(site.profile.name, lang, defaultLang),
      isPartOf: { '@id': `${siteDomain}/#website` },
      mainEntity: person,
    };
    graph.push(profilePage);

    if (publications?.enabled !== false && publications?.items) {
      for (const item of publications.items) {
        graph.push(buildScholarlyArticleSchema(item, lang, defaultLang, siteDomain));
      }
    }
  } else {
    graph.push(buildArticleSchema(page, site, lang, defaultLang, siteDomain, baseUrl));

    // 如果正文中显式包含 publications 指令或科研页面，也附带论文 Schema
    if (page.body.includes('::publications') && publications?.enabled !== false && publications?.items) {
      for (const item of publications.items) {
        graph.push(buildScholarlyArticleSchema(item, lang, defaultLang, siteDomain));
      }
    }
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

export function buildPageJsonLdString(options: JsonLdOptions): string {
  return serializeJsonLd(buildPageJsonLd(options));
}

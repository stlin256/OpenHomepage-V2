/**
 * spec 23: 自动化 Robots.txt 生成器（纯函数层）
 * 动态指引搜索引擎爬虫并指向 sitemap.xml。
 */
import type { SiteConfig } from './config.ts';
import { loadSiteConfig } from './config.ts';
import { resolveDataDir } from './data-dir.ts';
import { resolveAbsoluteUrl } from './sitemap.ts';

export interface RobotsOptions {
  siteUrl?: string | URL;
  baseUrl?: string;
  sitemapEnabled?: boolean;
}

export function buildRobotsTxt(site: SiteConfig, options: RobotsOptions = {}): string | null {
  const robots = site.seo?.robots;
  if (robots?.enabled === false) return null;

  const lines: string[] = [
    '# Robots.txt generated automatically by OpenHomepage-V2',
    'User-agent: *',
  ];

  const allow = robots?.allow ?? ['/'];
  const disallow = robots?.disallow ?? [];
  const crawlDelay = robots?.crawl_delay;

  for (const p of allow) {
    lines.push(`Allow: ${p}`);
  }

  for (const p of disallow) {
    lines.push(`Disallow: ${p}`);
  }

  if (typeof crawlDelay === 'number' && crawlDelay > 0) {
    lines.push(`Crawl-delay: ${crawlDelay}`);
  }

  const sitemapEnabled = options.sitemapEnabled ?? (site.seo?.sitemap?.enabled !== false);
  if (sitemapEnabled) {
    const sitemapUrl = resolveAbsoluteUrl('/sitemap.xml', options.siteUrl ?? site.site.url, options.baseUrl);
    lines.push('');
    lines.push('# Sitemaps');
    lines.push(`Sitemap: ${sitemapUrl}`);
  }

  return lines.join('\n') + '\n';
}

export async function buildRobotsDocument(options: RobotsOptions = {}): Promise<string | null> {
  const dataDir = resolveDataDir(process.cwd());
  const site = loadSiteConfig(dataDir);
  return buildRobotsTxt(site, options);
}

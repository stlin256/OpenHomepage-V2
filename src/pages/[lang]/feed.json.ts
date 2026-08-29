import type { APIRoute } from 'astro';
import { loadPages, loadSiteConfig } from '../../lib/config.ts';
import { normalizeFeedConfig } from '../../lib/feed.ts';
import { buildFeedDocument, feedLangParams } from '../../lib/feed-document.ts';
import { resolveDataDir } from '../../lib/data-dir.ts';

export function getStaticPaths() {
  const dataDir = resolveDataDir(process.cwd());
  const site = loadSiteConfig(dataDir);
  const cfg = normalizeFeedConfig(site.feed);
  if (!cfg.enabled || !cfg.formats.includes('json')) return [];
  return feedLangParams(loadPages(dataDir), site.site.language).map((lang) => ({ params: { lang } }));
}

export const GET: APIRoute = async ({ site, params }) => {
  const doc = await buildFeedDocument('json', { siteUrl: site, requestedLang: params.lang });
  if (doc === null) return new Response('', { status: 404 });
  return new Response(doc, { headers: { 'Content-Type': 'application/feed+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};

import type { APIRoute } from 'astro';
import { buildSitemapDocument } from '../lib/sitemap.ts';

export const GET: APIRoute = async ({ site }) => {
  const xml = await buildSitemapDocument({ siteUrl: site });
  if (xml === null) return new Response('', { status: 404 });
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

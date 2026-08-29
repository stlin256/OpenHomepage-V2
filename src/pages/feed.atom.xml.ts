import type { APIRoute } from 'astro';
import { buildFeedDocument } from '../lib/feed-document.ts';

export const GET: APIRoute = async ({ site }) => {
  const xml = await buildFeedDocument('atom', { siteUrl: site });
  if (xml === null) return new Response('', { status: 404 });
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};

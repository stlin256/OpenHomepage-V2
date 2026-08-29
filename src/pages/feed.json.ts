import type { APIRoute } from 'astro';
import { buildFeedDocument } from '../lib/feed-document.ts';

export const GET: APIRoute = async ({ site }) => {
  const json = await buildFeedDocument('json', { siteUrl: site });
  if (json === null) return new Response('', { status: 404 });
  return new Response(json, { headers: { 'Content-Type': 'application/feed+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};

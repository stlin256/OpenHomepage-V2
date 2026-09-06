import type { APIRoute } from 'astro';
import { buildRobotsDocument } from '../lib/robots.ts';

export const GET: APIRoute = async ({ site }) => {
  const txt = await buildRobotsDocument({ siteUrl: site });
  if (txt === null) return new Response('', { status: 404 });
  return new Response(txt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

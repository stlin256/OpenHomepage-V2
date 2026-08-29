import type { APIRoute } from 'astro';
import { resolveDataDir } from '../lib/data-dir.ts';
import { generateSiteSearchIndex } from '../lib/search-index.ts';

export const prerender = true;

export const GET: APIRoute = async () => {
  const dataDir = resolveDataDir(process.cwd());
  const index = generateSiteSearchIndex(dataDir);
  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

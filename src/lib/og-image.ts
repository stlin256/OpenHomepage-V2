/**
 * P1 动态 OG 分享图（Open Graph Social Image）生成与元数据解析。
 */
import { createHash } from 'node:crypto';
import type { PageEntry } from './config.ts';

export interface OgConfig {
  enabled?: boolean;
  layout?: 'editorial' | 'minimal';
  cache?: boolean;
  format?: 'png';
  show_avatar?: boolean;
  show_site_title?: boolean;
  accent_bar?: boolean;
  background?: string;
  default_image?: string;
}

export function normalizeOgConfig(cfg: OgConfig | undefined): Required<OgConfig> {
  return {
    enabled: cfg?.enabled !== false,
    layout: cfg?.layout === 'minimal' ? 'minimal' : 'editorial',
    cache: cfg?.cache !== false,
    format: 'png',
    show_avatar: cfg?.show_avatar !== false,
    show_site_title: cfg?.show_site_title !== false,
    accent_bar: cfg?.accent_bar !== false,
    background: cfg?.background ?? '#f8f7f2',
    default_image: cfg?.default_image ?? '',
  };
}

export function computeOgHash(input: {
  title: string;
  description?: string;
  siteTitle: string;
  lang: string;
  accent?: string;
  background?: string;
}): string {
  const payload = [
    input.title,
    input.description ?? '',
    input.siteTitle,
    input.lang,
    input.accent ?? '',
    input.background ?? '',
  ].join('|');
  return createHash('sha256').update(payload, 'utf8').digest('hex').slice(0, 16);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateOgSvg(options: {
  title: string;
  description?: string;
  siteTitle: string;
  accent: string;
  background: string;
  lang: string;
}): string {
  const bg = options.background || '#f8f7f2';
  const accent = options.accent || '#3a7bd5';
  const title = escapeXml(options.title);
  const desc = escapeXml(options.description ?? '');
  const siteTitle = escapeXml(options.siteTitle);

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2005/svg">
  <defs>
    <style>
      .bg { fill: ${bg}; }
      .site { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif; font-size: 28px; font-weight: 700; fill: ${accent}; letter-spacing: 0.05em; text-transform: uppercase; }
      .title { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Serif SC", serif; font-size: 58px; font-weight: 800; fill: #1c1b18; line-height: 1.25; }
      .desc { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif; font-size: 26px; fill: #5c584e; line-height: 1.45; }
      .bar { fill: ${accent}; }
    </style>
  </defs>
  <rect width="1200" height="630" class="bg" />
  <rect x="0" y="0" width="16" height="630" class="bar" />
  
  <g transform="translate(100, 110)">
    <text x="0" y="0" class="site">${siteTitle}</text>
  </g>
  
  <g transform="translate(100, 240)">
    <text x="0" y="0" class="title" width="1000">
      <tspan x="0" dy="0">${title}</tspan>
    </text>
  </g>

  ${
    desc
      ? `<g transform="translate(100, 390)">
    <text x="0" y="0" class="desc" width="1000">
      <tspan x="0" dy="0">${desc.slice(0, 110)}${desc.length > 110 ? '...' : ''}</tspan>
    </text>
  </g>`
      : ''
  }

  <g transform="translate(100, 540)">
    <rect x="0" y="0" width="80" height="4" class="bar" />
  </g>
</svg>`;
}

export function resolvePageOgMeta(options: {
  page: PageEntry & { ogImage?: string; ogTitle?: string; ogDescription?: string };
  siteTitle: string;
  baseUrl: string;
  siteOgConfig?: OgConfig;
}): { title: string; description?: string; imageUrl: string } {
  const page = options.page;
  const title = page.ogTitle || page.title;
  const description = page.ogDescription || page.description;
  const cleanBase = options.baseUrl.replace(/\/+$/, '');

  let imageUrl: string;
  if (page.ogImage) {
    const cleanPath = page.ogImage.replace(/^\/+/, '');
    imageUrl = `${cleanBase}/${cleanPath}`;
  } else {
    const hash = computeOgHash({
      title,
      description,
      siteTitle: options.siteTitle,
      lang: page.lang,
    });
    imageUrl = `${cleanBase}/assets/og/${hash}.png`;
  }

  return {
    title,
    description,
    imageUrl,
  };
}

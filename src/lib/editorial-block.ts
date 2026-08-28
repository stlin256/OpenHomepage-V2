import type { EditorialBlock, LocalizedText } from './config.ts';
import { resolveText } from './localize.ts';
import { withBase } from './base-url.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attribute(name: string, value: string | undefined): string {
  return value ? ` ${name}="${escapeHtml(value)}"` : '';
}

function assetUrl(path: string): string {
  return withBase(path.startsWith('/') ? path : `/${path}`);
}

function lazyImage(path: string, className: string, sizes: string): string {
  return `<img class="${className}" src="${escapeHtml(assetUrl(path))}" alt="" loading="lazy" decoding="async" sizes="${escapeHtml(sizes)}" />`;
}

/** 多语言字段解析上下文：内容语言 + 网站主语言（回退链 当前语言 → en → 主语言） */
interface ResolveCtx {
  lang: string;
  defaultLang?: string;
}

function text(field: LocalizedText, ctx: ResolveCtx): string {
  return resolveText(field, ctx.lang, ctx.defaultLang);
}

function actionHtml(
  action: NonNullable<EditorialBlock['actions']>[number],
  ctx: ResolveCtx,
  localizeHref?: (href: string) => string
): string {
  const label = escapeHtml(text(action.label, ctx));
  const variant = action.variant ?? 'outline';
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>';
  const inner = `<span>${label}</span>${icon}`;
  const url = action.url ? (localizeHref?.(action.url) ?? action.url) : undefined;
  if (!url) return `<button class="editorial-button ${variant}" type="button">${inner}</button>`;
  const external = !url.startsWith('/') && !url.startsWith('#');
  return `<a class="editorial-button ${variant}" href="${escapeHtml(url)}"${attribute('target', external ? '_blank' : undefined)}${attribute('rel', external ? 'noopener noreferrer' : undefined)}>${inner}</a>`;
}

function listItemHtml(
  item: NonNullable<EditorialBlock['list']>[number],
  index: number,
  ctx: ResolveCtx,
  localizeHref?: (href: string) => string
): string {
  const mask = item.image
    ? `<span class="editorial-item-mask" aria-hidden="true">${lazyImage(
        item.image,
        'editorial-item-mask-img',
        '(max-width: 768px) 60vw, 768px',
      )}</span>`
    : '';
  const meta = item.meta ? `<span class="editorial-item-meta">${escapeHtml(text(item.meta, ctx))}</span>` : '';
  const description = item.description
    ? `<span class="editorial-item-description">${escapeHtml(text(item.description, ctx))}</span>`
    : '';
  const body = `${mask}<span class="editorial-item-index">${String(index + 2).padStart(2, '0')}</span><span class="editorial-item-content"><span class="editorial-item-title">${escapeHtml(text(item.title, ctx))}</span>${meta}${description}</span>`;
  const delay = ` style="--delay:${index * 80}ms"`;
  const url = item.url ? (localizeHref?.(item.url) ?? item.url) : undefined;
  return url
    ? `<a class="editorial-item reveal" href="${escapeHtml(url)}"${delay}>${body}</a>`
    : `<article class="editorial-item reveal"${delay}>${body}</article>`;
}

function tileHtml(
  tile: NonNullable<EditorialBlock['tiles']>[number],
  ctx: ResolveCtx,
  localizeHref?: (href: string) => string
): string {
  const kicker = tile.kicker
    ? `<span class="tile-kicker">${escapeHtml(text(tile.kicker, ctx))}</span>`
    : '';
  const size = `tile-${tile.size ?? 'small'}`;
  const url = localizeHref?.(tile.url ?? '#') ?? tile.url ?? '#';
  const media = tile.image ? lazyImage(tile.image, 'editorial-tile-media', '(max-width: 768px) 41vw, 332px') : '';
  return `<a class="editorial-tile reveal ${size}" href="${escapeHtml(url)}" style="--delay:0ms">${media}<span class="tile-content">${kicker}<span class="tile-title">${escapeHtml(text(tile.title, ctx))}</span></span></a>`;
}

function archiveCardHtml(
  card: NonNullable<EditorialBlock['archive']>[number],
  index: number,
  ctx: ResolveCtx,
  localizeHref?: (href: string) => string
): string {
  const status = escapeHtml(card.status ? text(card.status, ctx) : 'Archive');
  const description = card.description
    ? `<span class="archive-description">${escapeHtml(text(card.description, ctx))}</span>`
    : '';
  const media = card.image
    ? lazyImage(card.image, 'archive-media', '120px')
    : '<span class="archive-media" aria-hidden="true"></span>';
  const body = `${media}<span class="archive-body"><span class="archive-status">${status}</span><span class="archive-title">${escapeHtml(text(card.title, ctx))}</span>${description}</span>`;
  const delay = ` style="--delay:${index * 90}ms"`;
  const url = card.url ? (localizeHref?.(card.url) ?? card.url) : undefined;
  return url
    ? `<a class="archive-card reveal" href="${escapeHtml(url)}"${delay}>${body}</a>`
    : `<article class="archive-card reveal"${delay}>${body}</article>`;
}

export function renderEditorialBlock(
  block: EditorialBlock,
  lang: string,
  localizeHref?: (href: string) => string,
  /** 追加到根 <section> 上的额外属性（M12d：编辑模式的 data-oh-cfg-block 坐标；生产不传） */
  rootAttrs?: Record<string, string>,
  /** 网站主语言（多语言字段回退链 当前语言 → en → 主语言） */
  defaultLang?: string,
): string {
  const ctx: ResolveCtx = { lang, defaultLang };
  const tag = block.tag ? `<span class="section-tag">${escapeHtml(text(block.tag, ctx))}</span>` : '';
  const description = block.description
    ? `<p>${escapeHtml(text(block.description, ctx))}</p>`
    : '';
  const actions = block.actions?.length
    ? `<div class="button-row reveal">${block.actions.map((action) => actionHtml(action, ctx, localizeHref)).join('')}</div>`
    : '';
  const list = block.list?.length
    ? `<div class="editorial-list">${block.list.map((item, index) => listItemHtml(item, index, ctx, localizeHref)).join('')}</div>`
    : '';
  const tiles = block.tiles?.length
    ? `<div class="editorial-tiles">${block.tiles.map((tile) => tileHtml(tile, ctx, localizeHref)).join('')}</div>`
    : '';
  const archive = block.archive?.length
    ? `<div class="archive-grid">${block.archive.map((card, index) => archiveCardHtml(card, index, ctx, localizeHref)).join('')}</div>`
    : '';
  const divider = block.divider ? '<hr class="editorial-divider" />' : '';
  const color = escapeHtml(block.color ?? 'var(--accent)');
  const extra = Object.entries(rootAttrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeHtml(v)}"`)
    .join('');
  return `<section class="home-block block-editorial reveal"${extra} style="--section-color:${color}"><header class="section-header reveal">${tag}<span class="section-rule" aria-hidden="true"></span></header><div class="editorial-heading"><h2>${escapeHtml(text(block.title, ctx))}</h2>${description}</div>${actions}${list}${tiles}${archive}${divider}</section>`;
}

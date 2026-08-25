import type { EditorialBlock } from './config.ts';
import { resolveText } from './localize.ts';

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
  return path.startsWith('/') ? path : `/${path}`;
}

function actionHtml(action: NonNullable<EditorialBlock['actions']>[number], lang: string): string {
  const label = escapeHtml(resolveText(action.label, lang));
  const variant = action.variant ?? 'outline';
  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>';
  const inner = `<span>${label}</span>${icon}`;
  if (!action.url) return `<button class="editorial-button ${variant}" type="button">${inner}</button>`;
  const external = !action.url.startsWith('/');
  return `<a class="editorial-button ${variant}" href="${escapeHtml(action.url)}"${attribute('target', external ? '_blank' : undefined)}${attribute('rel', external ? 'noopener noreferrer' : undefined)}>${inner}</a>`;
}

function listItemHtml(
  item: NonNullable<EditorialBlock['list']>[number],
  index: number,
  lang: string
): string {
  const mask = item.image
    ? `<span class="editorial-item-mask" style="background-image:url('${escapeHtml(assetUrl(item.image))}')" aria-hidden="true"></span>`
    : '';
  const meta = item.meta ? `<span class="editorial-item-meta">${escapeHtml(resolveText(item.meta, lang))}</span>` : '';
  const description = item.description
    ? `<span class="editorial-item-description">${escapeHtml(resolveText(item.description, lang))}</span>`
    : '';
  const body = `${mask}<span class="editorial-item-index">${String(index + 2).padStart(2, '0')}</span><span class="editorial-item-content"><span class="editorial-item-title">${escapeHtml(resolveText(item.title, lang))}</span>${meta}${description}</span>`;
  const delay = ` style="--delay:${index * 80}ms"`;
  return item.url
    ? `<a class="editorial-item reveal" href="${escapeHtml(item.url)}"${delay}>${body}</a>`
    : `<article class="editorial-item reveal"${delay}>${body}</article>`;
}

function tileHtml(tile: NonNullable<EditorialBlock['tiles']>[number], lang: string): string {
  const kicker = tile.kicker
    ? `<span class="tile-kicker">${escapeHtml(resolveText(tile.kicker, lang))}</span>`
    : '';
  const image = tile.image ? `url('${escapeHtml(assetUrl(tile.image))}')` : '';
  const size = `tile-${tile.size ?? 'small'}`;
  return `<a class="editorial-tile reveal ${size}" href="${escapeHtml(tile.url ?? '#')}" style="--tile-image:${image};--delay:0ms"><span class="tile-content">${kicker}<span class="tile-title">${escapeHtml(resolveText(tile.title, lang))}</span></span></a>`;
}

function archiveCardHtml(
  card: NonNullable<EditorialBlock['archive']>[number],
  index: number,
  lang: string
): string {
  const status = escapeHtml(card.status ? resolveText(card.status, lang) : 'Archive');
  const description = card.description
    ? `<span class="archive-description">${escapeHtml(resolveText(card.description, lang))}</span>`
    : '';
  const media = card.image
    ? `<span class="archive-media" style="background-image:url('${escapeHtml(assetUrl(card.image))}')" aria-hidden="true"></span>`
    : '<span class="archive-media" aria-hidden="true"></span>';
  const body = `${media}<span class="archive-body"><span class="archive-status">${status}</span><span class="archive-title">${escapeHtml(resolveText(card.title, lang))}</span>${description}</span>`;
  const delay = ` style="--delay:${index * 90}ms"`;
  return card.url
    ? `<a class="archive-card reveal" href="${escapeHtml(card.url)}"${delay}>${body}</a>`
    : `<article class="archive-card reveal"${delay}>${body}</article>`;
}

export function renderEditorialBlock(block: EditorialBlock, lang: string): string {
  const tag = block.tag ? `<span class="section-tag">${escapeHtml(resolveText(block.tag, lang))}</span>` : '';
  const description = block.description
    ? `<p>${escapeHtml(resolveText(block.description, lang))}</p>`
    : '';
  const actions = block.actions?.length
    ? `<div class="button-row reveal">${block.actions.map((action) => actionHtml(action, lang)).join('')}</div>`
    : '';
  const list = block.list?.length
    ? `<div class="editorial-list">${block.list.map((item, index) => listItemHtml(item, index, lang)).join('')}</div>`
    : '';
  const tiles = block.tiles?.length
    ? `<div class="editorial-tiles">${block.tiles.map((tile) => tileHtml(tile, lang)).join('')}</div>`
    : '';
  const archive = block.archive?.length
    ? `<div class="archive-grid">${block.archive.map((card, index) => archiveCardHtml(card, index, lang)).join('')}</div>`
    : '';
  const divider = block.divider ? '<hr class="editorial-divider" />' : '';
  const color = escapeHtml(block.color ?? 'var(--accent)');
  return `<section class="home-block block-editorial reveal" style="--section-color:${color}"><header class="section-header reveal">${tag}<span class="section-rule" aria-hidden="true"></span></header><div class="editorial-heading"><h2>${escapeHtml(resolveText(block.title, lang))}</h2>${description}</div>${actions}${list}${tiles}${archive}${divider}</section>`;
}

/**
 * RSS 区块构建侧视图模型（docs/specs/05 卡片字段 + spec 01 排序规则）。
 * 读 .cache/rss.json，按 rss.yaml 的 display 产出两种视图：
 * - grouped：按源分栏（栏目顺序 = sources 顺序；latest 栏内按时间倒序，curated 保持配置顺序）；
 * - mixed：统一卡片流（sortMixed：无日期的排最后 → 权重降序 → 同权重按时间倒序）。
 * 卡片摘要两级：卡片 120 字符（构建时固化），hover 浮层用全文（prefetch 已截 ≤300）。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { RssConfig, RssSource } from './config.ts';
import { canonicalText, resolveText } from './localize.ts';
import { truncateText, type RssCache, type RssEntry } from './prefetch.ts';

/** 卡片摘要字符数（spec 05：默认 120 字符，构建时固化） */
export const CARD_SUMMARY_MAX = 120;
/** 源缺省权重 */
export const DEFAULT_WEIGHT = 1;

/** 读 .cache/rss.json；文件缺失/损坏时 warning 并返回 null（构建侧空态，报错闸口在 prefetch） */
export function loadRssCache(
  cacheDir: string,
  warn: (msg: string) => void = console.warn,
): RssCache | null {
  const file = path.join(cacheDir, 'rss.json');
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    warn(
      `读不到 ${file}，RSS 区块渲染空态；请先运行 npm run prefetch。/` +
        ` ${file} not found; RSS block renders an empty state. Run \`npm run prefetch\` first.`,
    );
    return null;
  }
  try {
    return JSON.parse(text) as RssCache;
  } catch (e) {
    warn(`解析 ${file} 失败（${(e as Error).message}），RSS 区块渲染空态。`);
    return null;
  }
}

/** 封面声明值 → 可用 URL：外部 URL 原样；data/ 内本地路径（assets/...）补 / 前缀 */
export function coverUrl(cover: string | null | undefined): string | null {
  if (!cover) return null;
  const trimmed = cover.trim();
  if (!trimmed || trimmed === 'none' || trimmed === 'null' || trimmed === 'false') return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `/${trimmed.replace(/^\/+/, '')}`;
}

/** ISO 时间 → 卡片日期 'YYYY-MM-DD'；无法解析/为空返回 null */
export function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return iso.slice(0, 10);
}

export interface RssCardView {
  title: string;
  link: string;
  /** 来源名（sources[].name） */
  source: string;
  /** ISO 原文时间（无日期为 null，卡片悬停 title 用） */
  published: string | null;
  /** 卡片日期 'YYYY-MM-DD'（无日期为 null） */
  day: string | null;
  /** 卡片摘要（≤120 字符） */
  summary: string;
  cover: string | null;
  /** curated 推荐语 */
  note: string | null;
  /** 源权重（mixed 排序用） */
  weight: number;
}

function toCard(entry: RssEntry, source: string, weight: number, summaryMax: number, lang: string): RssCardView {
  return {
    title: entry.title,
    link: entry.link,
    source,
    published: entry.published,
    day: formatDay(entry.published),
    summary: truncateText(entry.summary, summaryMax),
    cover: coverUrl(entry.cover),
    note: entry.note ? resolveText(entry.note, lang) : null,
    weight,
  };
}

/** 时间倒序（无日期的排最后） */
export function sortByDateDesc(cards: RssCardView[]): RssCardView[] {
  return [...cards].sort((a, b) => {
    if (a.published && b.published) return b.published.localeCompare(a.published);
    if (a.published) return -1;
    if (b.published) return 1;
    return 0;
  });
}

/**
 * mixed 模式排序（spec 01）：无日期的排最后 → 权重降序（weight 越大越靠前）→
 * 同权重按时间倒序。返回新数组，不改入参。
 */
export function sortMixed(cards: RssCardView[]): RssCardView[] {
  return [...cards].sort((a, b) => {
    if (!!a.published !== !!b.published) return a.published ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    if (a.published && b.published) return b.published.localeCompare(a.published);
    return 0;
  });
}

export interface RssColumnView {
  name: string;
  /** 该源 error 非空但有旧条目（stale 降级） */
  stale: boolean;
  fetchedAt: number | null;
  cards: RssCardView[];
}

export type RssView =
  | { display: 'grouped'; columns: RssColumnView[] }
  | { display: 'mixed'; cards: RssCardView[]; stale: boolean; fetchedAt: number | null };

/**
 * 构建 RSS 视图。sources 顺序以 rss.yaml 为准（缓存按 规范源名+url 匹配）。
 * 源名与 curated 推荐语支持多语言映射，按 opts.lang 解析（回退 en → zh）。
 * cache 为 null（.cache 文件缺失/损坏，从未 prefetch）→ 返回 null，组件渲染空态提示；
 * cache 存在但全部源无条目（抓取降级，spec 07 §3）→ 空视图，组件整区隐藏。
 * 空栏目（无条目）在两种模式下都丢弃。
 */
export function buildRssView(
  cache: RssCache | null,
  config: RssConfig,
  opts: { summaryMax?: number; lang?: string } = {},
): RssView | null {
  if (!cache) return null;
  const summaryMax = opts.summaryMax ?? CARD_SUMMARY_MAX;
  const lang = opts.lang ?? 'zh';
  const columns: RssColumnView[] = [];
  for (const src of config.sources) {
    const cached = cache.sources.find((s) => s.name === canonicalText(src.name) && s.url === src.url);
    const weight = src.weight ?? DEFAULT_WEIGHT;
    const name = resolveText(src.name, lang);
    let cards = (cached?.entries ?? []).map((e) => toCard(e, name, weight, summaryMax, lang));
    // latest 栏内时间倒序；curated 保持配置顺序（spec 05：列表顺序即展示顺序）
    if (src.mode === 'latest') cards = sortByDateDesc(cards);
    if (cards.length === 0) continue;
    columns.push({
      name,
      stale: cached?.error != null,
      fetchedAt: cached?.fetched_at ?? null,
      cards,
    });
  }
  if (config.display === 'mixed') {
    return {
      display: 'mixed',
      cards: sortMixed(columns.flatMap((c) => c.cards)),
      stale: columns.some((c) => c.stale),
      fetchedAt: columns.reduce<number | null>(
        (acc, c) => (c.fetchedAt !== null && (acc === null || c.fetchedAt > acc) ? c.fetchedAt : acc),
        null,
      ),
    };
  }
  return { display: 'grouped', columns };
}

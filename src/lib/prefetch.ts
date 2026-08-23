/**
 * prefetch 数据预取核心（docs/specs/07-prefetch.md）：
 * 抓取 GitHub（REST 用户/pinned 仓库 + GraphQL 贡献图）与 RSS（latest/curated），
 * 写入 .cache/{github,rss,meta}.json 供 Astro 构建读取。
 *
 * 设计要点：
 * - 纯 Node 实现，网络层（fetchFn）/时钟（now）均可注入，单测不发真实请求；
 * - TTL：正常块 1h 内不重复抓取；失败块 15min 退避；--force 忽略 TTL；
 * - 降级：抓取失败用旧缓存，error 记录原因；全部失败且无旧缓存 → ok=false（缺数即报错）；
 * - 源间并发上限 4，单源内串行，总超时 60s，单源失败不影响其他源。
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import Parser from 'rss-parser';
import { loadSiteConfig, loadRssConfig, type RssSource } from './config.ts';

// ---------- 常量 ----------

/** 正常缓存 TTL：1 小时 */
export const TTL_OK_MS = 60 * 60 * 1000;
/** 失败块退避：15 分钟 */
export const TTL_FAIL_MS = 15 * 60 * 1000;
/** 卡片摘要最大字符数（spec 05：摘要 ≤300 字） */
export const SUMMARY_MAX = 300;

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'openhomepage-prefetch';
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TOTAL_TIMEOUT_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

// ---------- 类型 ----------

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface CacheBlock<T> {
  data: T | null;
  /** 数据成功获取的时间（失败降级时保留旧值，保证渲染端显示真实数据年龄） */
  fetched_at: number | null;
  error: string | null;
  /** 最近一次抓取失败时间（15min 退避依据） */
  failed_at: number | null;
}

export interface GithubUser {
  login: string;
  name?: string | null;
  avatar_url?: string;
  bio?: string | null;
  company?: string | null;
  blog?: string;
  location?: string | null;
  twitter_username?: string | null;
  followers?: number;
  following?: number;
  public_repos?: number;
  html_url?: string;
}

export interface GithubPinnedRepo {
  name: string;
  full_name: string;
  description?: string | null;
  html_url?: string;
  homepage?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  pushed_at?: string;
  updated_at?: string;
  topics?: string[];
  /** site.yaml pinned[].note，覆盖官方描述 */
  note: string | null;
}

export interface ContributionDay {
  contributionCount: number;
  date: string;
}

export interface Contributions {
  total: number;
  weeks: { contributionDays: ContributionDay[] }[];
}

export interface GithubCache {
  user?: CacheBlock<GithubUser>;
  pinned?: CacheBlock<GithubPinnedRepo[]>;
  contributions?: CacheBlock<Contributions>;
}

export interface RssEntry {
  title: string;
  link: string;
  published: string | null;
  summary: string;
  cover: string | null;
  note: string | null;
}

export interface RssSourceCache {
  name: string;
  url: string;
  mode: 'latest' | 'curated';
  entries: RssEntry[];
  fetched_at: number | null;
  error: string | null;
  failed_at: number | null;
}

export interface RssCache {
  sources: RssSourceCache[];
}

/** fresh=本次抓取成功；cached=TTL 命中；stale=失败降级旧缓存；partial=部分条目失败；placeholder=本地无 PAT 占位；error=失败且无缓存 */
export type BlockStatus = 'fresh' | 'cached' | 'stale' | 'partial' | 'placeholder' | 'error';

export interface BlockReport {
  key: string;
  status: BlockStatus;
  error: string | null;
}

export interface PrefetchOptions {
  dataDir: string;
  cacheDir: string;
  /** 忽略 TTL 强制全量抓取（CI 每次用） */
  force?: boolean;
  /** 网络层注入点，缺省用全局 fetch */
  fetchFn?: FetchFn;
  /** 时钟注入点，缺省 Date.now */
  now?: () => number;
  /** GitHub token；undefined 时按 GH_PAT → GITHUB_TOKEN → GH_TOKEN 读环境变量，null 强制匿名 */
  token?: string | null;
  /** 是否 CI 环境（缺省读 process.env.CI）；CI 上贡献图无 token 视为缺数失败 */
  ci?: boolean;
  /** 源间并发上限，默认 4 */
  concurrency?: number;
  /** 总超时，默认 60s */
  totalTimeoutMs?: number;
  /** 单请求超时，默认 15s */
  requestTimeoutMs?: number;
}

export interface PrefetchResult {
  /** false → CLI 非零退出（所有数据块失败且无任何旧缓存） */
  ok: boolean;
  blocks: BlockReport[];
  warnings: string[];
}

// ---------- 文本工具 ----------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** 解码常见命名实体与数字实体（十进制/十六进制） */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

/** 去 script/style 块与所有 HTML 标签，解码实体，压缩空白 */
export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** 按码点截断（不劈开 emoji 代理对） */
export function truncateText(s: string, max: number): string {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max).join('').trimEnd() : s;
}

function normalizeDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function normalizeLink(s: string): string {
  return s.trim().replace(/\/+$/, '');
}

function sameLink(a: string, b: string): boolean {
  return normalizeLink(a) === normalizeLink(b);
}

/** 白名单字段挑选，丢弃 node_id 等冗余字段 */
function pick<T>(obj: Record<string, unknown>, fields: readonly string[]): T {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (obj[f] !== undefined) out[f] = obj[f];
  return out as T;
}

// ---------- 网络层 ----------

async function fetchText(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<string> {
  const resp = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}${resp.statusText ? ` ${resp.statusText}` : ''}（${url}）`);
  }
  return resp.text();
}

async function fetchJson(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  return JSON.parse(await fetchText(fetchFn, url, init, timeoutMs)) as Record<string, unknown>;
}

function githubHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// ---------- GitHub ----------

const USER_FIELDS = [
  'login', 'name', 'avatar_url', 'bio', 'company', 'blog', 'location',
  'twitter_username', 'followers', 'following', 'public_repos', 'html_url',
] as const;

const REPO_FIELDS = [
  'name', 'full_name', 'description', 'html_url', 'homepage', 'language',
  'stargazers_count', 'forks_count', 'pushed_at', 'updated_at', 'topics',
] as const;

const CONTRIBUTIONS_QUERY = `query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date } }
      }
    }
  }
}`;

interface Ctx {
  fetchFn: FetchFn;
  token: string | null;
  requestTimeoutMs: number;
}

async function fetchGithubUser(ctx: Ctx, username: string): Promise<GithubUser> {
  const data = await fetchJson(
    ctx.fetchFn,
    `${GITHUB_API}/users/${encodeURIComponent(username)}`,
    { headers: githubHeaders(ctx.token) },
    ctx.requestTimeoutMs
  );
  return pick<GithubUser>(data, USER_FIELDS);
}

async function fetchPinnedRepos(
  ctx: Ctx,
  pinned: { repo: string; note?: string }[]
): Promise<GithubPinnedRepo[]> {
  // 单源内串行（spec 07 §2）
  const repos: GithubPinnedRepo[] = [];
  for (const p of pinned) {
    const [owner, name] = p.repo.split('/');
    if (!owner || !name) {
      throw new Error(`pinned 仓库格式错误：${p.repo}（应为 owner/repo）`);
    }
    const data = await fetchJson(
      ctx.fetchFn,
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
      { headers: githubHeaders(ctx.token) },
      ctx.requestTimeoutMs
    );
    repos.push({ ...pick<Omit<GithubPinnedRepo, 'note'>>(data, REPO_FIELDS), note: p.note ?? null });
  }
  return repos;
}

async function fetchContributions(ctx: Ctx, username: string): Promise<Contributions> {
  const body = (await fetchJson(
    ctx.fetchFn,
    `${GITHUB_API}/graphql`,
    {
      method: 'POST',
      headers: { ...githubHeaders(ctx.token), 'content-type': 'application/json' },
      body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { login: username } }),
    },
    ctx.requestTimeoutMs
  )) as {
    errors?: { message: string }[];
    data?: {
      user?: {
        contributionsCollection?: {
          contributionCalendar?: { totalContributions: number; weeks: Contributions['weeks'] };
        };
      };
    };
  };
  if (body.errors?.length) {
    throw new Error(`GraphQL：${body.errors.map((e) => e.message).join('；')}`);
  }
  const calendar = body.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) {
    throw new Error('GraphQL 响应缺少 contributionCalendar（用户不存在或 token 权限不足）');
  }
  return { total: calendar.totalContributions, weeks: calendar.weeks };
}

// ---------- RSS ----------

/** rss-parser 的 item 里我们关心的字段（RSS/Atom 已归一化） */
interface FeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  content?: string;
  summary?: string;
  contentSnippet?: string;
  'content:encoded'?: string;
}

async function parseFeed(xml: string): Promise<FeedItem[]> {
  // 每次新建实例，避免并发解析共享内部状态
  const parser = new Parser();
  const feed = await parser.parseString(xml);
  return feed.items as unknown as FeedItem[];
}

function rawSummary(item: FeedItem): string {
  return (
    item['content:encoded'] ?? item.content ?? item.summary ?? item.contentSnippet ?? ''
  );
}

function feedItemToEntry(item: FeedItem, cover: string | null, note: string | null): RssEntry {
  return {
    title: (item.title ?? '').trim() || '(无标题)',
    link: item.link ?? '',
    published: normalizeDate(item.isoDate ?? item.pubDate),
    summary: truncateText(stripHtml(rawSummary(item)), SUMMARY_MAX),
    cover,
    note,
  };
}

/** 提取到的图片地址归一化为绝对 URL：去实体/空白；data: URI 丢弃（缓存 JSON 不存内联图） */
function resolveImageUrl(src: string | null, pageUrl?: string): string | null {
  if (!src) return null;
  const s = decodeEntities(src).trim();
  if (!s || /^data:/i.test(s)) return null;
  if (!pageUrl) return /^https?:\/\//i.test(s) ? s : null;
  try {
    return new URL(s, pageUrl).href;
  } catch {
    return null;
  }
}

/**
 * 从文章页 HTML 提取标题（og:title → <title>）、摘要（meta description → og:description → 首段文本）
 * 与封面（og:image → twitter:image(:src) → body 首个 <img>；相对地址按 pageUrl 解析为绝对 URL）。
 * 封面用于 curated 条目未显式声明 cover 时的回退（spec 05）。
 */
export function scrapeArticleHtml(
  html: string,
  pageUrl?: string,
): { title: string | null; summary: string | null; cover: string | null } {
  const extractMeta = (attr: 'name' | 'property', value: string): string | null => {
    const tag = html.match(new RegExp(`<meta\\b[^>]*\\b${attr}=["']${value}["'][^>]*>`, 'i'))?.[0];
    if (!tag) return null;
    return tag.match(/\bcontent=["']([\s\S]*?)["']/i)?.[1] ?? null;
  };
  const ogTitle = extractMeta('property', 'og:title');
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = ogTitle ?? titleTag ?? null;

  const metaDesc = extractMeta('name', 'description') ?? extractMeta('property', 'og:description');
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  let summary = metaDesc;
  if (!summary) {
    const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)];
    // 优先取第一段有实质内容（≥40 字符）的段落，否则退到第一段
    const substantial = paragraphs.find((p) => [...stripHtml(p[1])].length >= 40);
    summary = (substantial ?? paragraphs[0])?.[1] ?? null;
  }

  const metaCover =
    extractMeta('property', 'og:image') ??
    extractMeta('name', 'twitter:image') ??
    extractMeta('property', 'twitter:image') ??
    extractMeta('name', 'twitter:image:src');
  const firstImg = body.match(/<img\b[^>]*?\bsrc=["']([^"']+)["']/i)?.[1] ?? null;
  const cover = resolveImageUrl(metaCover ?? firstImg, pageUrl);

  return {
    title: title ? decodeEntities(stripHtml(title)) : null,
    summary: summary ? truncateText(stripHtml(summary), SUMMARY_MAX) : null,
    cover,
  };
}

async function fetchRssSource(ctx: Ctx, src: RssSource): Promise<{ data: RssEntry[]; partialError?: string }> {
  // 1. 拉 feed：latest 必需；curated 尽力（失败仍可逐条抓文章页）
  let items: FeedItem[] = [];
  let feedError: string | null = null;
  try {
    const xml = await fetchText(
      ctx.fetchFn,
      src.url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
      },
      ctx.requestTimeoutMs
    );
    items = await parseFeed(xml);
  } catch (e) {
    feedError = (e as Error).message;
  }

  if (src.mode === 'latest') {
    if (feedError) throw new Error(`feed 抓取失败：${feedError}`);
    const n = src.latest ?? 5;
    return { data: items.slice(0, n).map((it) => feedItemToEntry(it, src.cover ?? null, null)) };
  }

  // curated：articles 列表顺序即展示顺序
  const articles = src.articles ?? [];
  const entries: RssEntry[] = [];
  const failures: string[] = [];
  for (const art of articles) {
    const declaredCover = art.cover ?? src.cover ?? null;
    const note = art.note ?? null;
    const hit = items.find((it) => it.link && sameLink(it.link, art.url));
    // feed 命中且封面已显式声明：无需抓文章页
    if (hit && declaredCover) {
      entries.push({ ...feedItemToEntry(hit, declaredCover, note), link: art.url });
      continue;
    }
    // 其余情况抓文章页：feed 未命中（补标题/摘要），或未声明封面（提取 og:image，spec 05）
    try {
      const html = await fetchText(ctx.fetchFn, art.url, { headers: { 'User-Agent': USER_AGENT } }, ctx.requestTimeoutMs);
      const scraped = scrapeArticleHtml(html, art.url);
      const cover = declaredCover ?? scraped.cover;
      if (hit) {
        entries.push({ ...feedItemToEntry(hit, cover, note), link: art.url });
        continue;
      }
      if (!scraped.title && !scraped.summary) {
        throw new Error('页面无可提取内容');
      }
      entries.push({
        title: scraped.title ?? art.url,
        link: art.url,
        published: null,
        summary: scraped.summary ?? '',
        cover,
        note,
      });
    } catch (e) {
      if (hit) {
        // 仅封面抓取失败不致命：feed 数据完整，封面回退声明值（可能为 null）
        entries.push({ ...feedItemToEntry(hit, declaredCover, note), link: art.url });
        continue;
      }
      failures.push(`${art.url}（${(e as Error).message}）`);
      entries.push({ title: art.url, link: art.url, published: null, summary: '', cover: declaredCover, note });
    }
  }
  if (failures.length === 0) return { data: entries };
  // feed 与文章页全灭 → 整个源失败，走缓存降级
  if (failures.length === articles.length && items.length === 0) {
    throw new Error(`全部文章抓取失败：${failures.join('；')}`);
  }
  return { data: entries, partialError: `部分文章抓取失败：${failures.join('；')}` };
}

// ---------- 缓存块状态机 ----------

interface ResolvedBlock<T> {
  block: CacheBlock<T>;
  status: BlockStatus;
}

/**
 * 单块 TTL/退避/降级状态机：
 * - 非 force 且旧块新鲜（error=null 且 <1h）→ cached，直接保留；
 * - 非 force 且旧块是最近失败（<15min）→ 不重试，保持原状；
 * - 否则抓取：成功 → fresh（部分失败 → partial）；失败 → 有旧数据 stale，否则 error。
 */
async function resolveBlock<T>(
  old: CacheBlock<T> | undefined,
  fetcher: () => Promise<{ data: T; partialError?: string }>,
  ctx: { now: number; force: boolean }
): Promise<ResolvedBlock<T>> {
  if (!ctx.force && old) {
    if (old.error === null && old.fetched_at !== null && ctx.now - old.fetched_at < TTL_OK_MS) {
      return { block: old, status: 'cached' };
    }
    if (old.error !== null && old.failed_at !== null && ctx.now - old.failed_at < TTL_FAIL_MS) {
      return { block: old, status: old.data !== null ? 'stale' : 'error' };
    }
  }
  try {
    const { data, partialError } = await fetcher();
    if (partialError) {
      return {
        block: { data, fetched_at: ctx.now, error: partialError, failed_at: ctx.now },
        status: 'partial',
      };
    }
    return { block: { data, fetched_at: ctx.now, error: null, failed_at: null }, status: 'fresh' };
  } catch (e) {
    const msg = (e as Error).message;
    if (old && old.data !== null) {
      return { block: { ...old, error: msg, failed_at: ctx.now }, status: 'stale' };
    }
    return {
      block: { data: null, fetched_at: old?.fetched_at ?? null, error: msg, failed_at: ctx.now },
      status: 'error',
    };
  }
}

// ---------- 并发与超时 ----------

/** 手写并发限制器（上限 max） */
function createLimiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

/** 剩余总时限内未完成则拒绝（超时走普通失败降级路径） */
async function withDeadline<T>(p: Promise<T>, remainingMs: number): Promise<T> {
  if (remainingMs <= 0) throw new Error('总超时已到，任务未开始即超时');
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`总超时（${remainingMs}ms）已到，任务超时`)), remainingMs);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------- 缓存文件 IO ----------

function readJsonFile<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** 原子写入：先写临时文件再 rename，避免构建读到半截 JSON */
function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, file);
}

// ---------- 主流程 ----------

function tokenFromEnv(): string | null {
  return process.env.GH_PAT || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

export async function runPrefetch(options: PrefetchOptions): Promise<PrefetchResult> {
  const now = options.now ?? (() => Date.now());
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  const token = options.token !== undefined ? options.token : tokenFromEnv();
  const ci = options.ci ?? !!process.env.CI;
  const force = options.force ?? false;
  const limit = createLimiter(Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY));
  const totalTimeoutMs = options.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;
  const ctx: Ctx = {
    fetchFn,
    token,
    requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
  };

  const site = loadSiteConfig(options.dataDir);
  const rssEnabled = !!site.rss && site.rss.enabled !== false;
  const rssSources = rssEnabled
    ? loadRssConfig(options.dataDir, site.rss?.sources_file).sources
    : [];

  const oldGithub = readJsonFile<GithubCache>(path.join(options.cacheDir, 'github.json')) ?? {};
  const oldRss = readJsonFile<RssCache>(path.join(options.cacheDir, 'rss.json')) ?? { sources: [] };

  const t = now();
  const deadline = t + totalTimeoutMs;
  const reportMap = new Map<string, BlockReport>();
  const orderedKeys: string[] = [];
  const newGithub: GithubCache = {};
  const newRss: RssCache = { sources: [] };
  const jobs: Promise<void>[] = [];

  const addJob = (key: string, job: () => Promise<void>) => {
    orderedKeys.push(key);
    jobs.push(
      limit(async () => {
        try {
          await job();
        } catch (e) {
          // resolveBlock 已覆盖抓取失败；这里兜底意外错误，保证单块不拖垮整体
          reportMap.set(key, { key, status: 'error', error: `内部错误：${(e as Error).message}` });
        }
      })
    );
  };

  const finish = <T>(key: string, r: ResolvedBlock<T>, apply: (b: CacheBlock<T>) => void) => {
    apply(r.block);
    reportMap.set(key, { key, status: r.status, error: r.block.error });
  };

  // ---- github.user ----
  addJob('github.user', async () => {
    const r = await resolveBlock(
      oldGithub.user,
      () => withDeadline(fetchGithubUser(ctx, site.github.username).then((data) => ({ data })), deadline - now()),
      { now: t, force }
    );
    finish('github.user', r, (b) => (newGithub.user = b));
  });

  // ---- github.pinned ----
  if (site.github.pinned && site.github.pinned.length > 0) {
    const pinned = site.github.pinned;
    addJob('github.pinned', async () => {
      const r = await resolveBlock(
        oldGithub.pinned,
        () => withDeadline(fetchPinnedRepos(ctx, pinned).then((data) => ({ data })), deadline - now()),
        { now: t, force }
      );
      finish('github.pinned', r, (b) => (newGithub.pinned = b));
    });
  }

  // ---- github.contributions ----
  if (site.github.show_contributions !== false) {
    addJob('github.contributions', async () => {
      const old = oldGithub.contributions;
      if (!token && !ci) {
        // spec 07 §4 例外：本地无 PAT 时写占位状态，不阻断本地预览
        const block: CacheBlock<Contributions> = old ?? {
          data: null,
          fetched_at: null,
          error: '本地未配置 GH_PAT，贡献图构建时渲染占位',
          failed_at: null,
        };
        reportMap.set('github.contributions', {
          key: 'github.contributions',
          status: 'placeholder',
          error: block.error,
        });
        newGithub.contributions = block;
        return;
      }
      const r = await resolveBlock(
        old,
        () =>
          withDeadline(
            token
              ? fetchContributions(ctx, site.github.username).then((data) => ({ data }))
              : Promise.reject(new Error('CI 环境缺少 GH_PAT，无法获取贡献图')),
            deadline - now()
          ),
        { now: t, force }
      );
      finish('github.contributions', r, (b) => (newGithub.contributions = b));
    });
  }

  // ---- rss.* ----
  const usedKeys = new Set(orderedKeys);
  for (const src of rssSources) {
    let key = `rss.${src.name}`;
    for (let i = 2; usedKeys.has(key); i += 1) key = `rss.${src.name}#${i}`;
    usedKeys.add(key);
    const oldSource = oldRss.sources?.find((s) => s.name === src.name && s.url === src.url);
    // 失败块写盘时 entries 为 []：error 非空且无条目视为「无旧数据」，否则空数组会被误当有缓存
    const oldBlock: CacheBlock<RssEntry[]> | undefined = oldSource
      ? {
          data: oldSource.error !== null && oldSource.entries.length === 0 ? null : oldSource.entries,
          fetched_at: oldSource.fetched_at,
          error: oldSource.error,
          failed_at: oldSource.failed_at,
        }
      : undefined;
    addJob(key, async () => {
      const r = await resolveBlock(
        oldBlock,
        () => withDeadline(fetchRssSource(ctx, src), deadline - now()),
        { now: t, force }
      );
      finish(key, r, (b) => {
        newRss.sources.push({
          name: src.name,
          url: src.url,
          mode: src.mode,
          entries: b.data ?? [],
          fetched_at: b.fetched_at,
          error: b.error,
          failed_at: b.failed_at,
        });
      });
    });
  }

  await Promise.all(jobs);

  // rss.json 的 sources 顺序与配置一致（job 并发完成，push 顺序不定，这里重排）
  newRss.sources.sort(
    (a, b) =>
      rssSources.findIndex((s) => s.name === a.name && s.url === a.url) -
      rssSources.findIndex((s) => s.name === b.name && s.url === b.url)
  );

  const blocks = orderedKeys.map((k) => reportMap.get(k)!);
  // placeholder（本地无 PAT 的贡献图）是中性块：不算失败，但也不构成「有数据」
  const ok = blocks.some((b) => ['fresh', 'cached', 'stale', 'partial'].includes(b.status));
  const warnings = blocks
    .filter((b) => b.status === 'stale' || b.status === 'partial' || b.status === 'error')
    .map((b) => `${b.key}（${b.status}）：${b.error ?? ''}`);

  writeJsonAtomic(path.join(options.cacheDir, 'github.json'), newGithub);
  if (rssEnabled) {
    writeJsonAtomic(path.join(options.cacheDir, 'rss.json'), newRss);
  }
  writeJsonAtomic(path.join(options.cacheDir, 'meta.json'), {
    updated_at: now(),
    ok,
    blocks: blocks.map((b) => ({ key: b.key, status: b.status, error: b.error })),
  });

  return { ok, blocks, warnings };
}

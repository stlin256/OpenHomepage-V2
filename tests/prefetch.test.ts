/**
 * prefetch 数据预取测试：全程注入 mock fetch，不发真实网络请求。
 * 覆盖 spec 07：REST/GraphQL 解析、RSS latest/curated 两模式、
 * TTL / 失败退避 / 旧缓存降级、--force、退出码聚合、并发上限与总超时。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  runPrefetch,
  stripHtml,
  truncateText,
  TTL_OK_MS,
  TTL_FAIL_MS,
  type FetchFn,
  type GithubCache,
  type RssCache,
  type PrefetchOptions,
} from '../src/lib/prefetch.ts';

// ---------- 测试基建 ----------

const T0 = 1_790_000_000_000; // 固定时钟，避免依赖真实时间

let dir: string;
let dataDir: string;
let cacheDir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'oh-prefetch-'));
  dataDir = path.join(dir, 'data');
  cacheDir = path.join(dir, '.cache');
  mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(siteYaml: string, rssYaml?: string) {
  writeFileSync(path.join(dataDir, 'site.yaml'), siteYaml);
  if (rssYaml !== undefined) writeFileSync(path.join(dataDir, 'rss.yaml'), rssYaml);
}

const SITE_FULL = `
site: { title: T }
profile: { name: N }
github:
  username: octocat
  show_contributions: true
  pinned:
    - { repo: octocat/hello, note: 我的项目 }
    - { repo: octocat/world }
rss: { enabled: true, sources_file: rss.yaml }
`;

const RSS_FULL = `
display: grouped
sources:
  - name: Blog
    url: https://blog.test/feed.xml
    mode: latest
    latest: 2
    cover: assets/c.png
  - name: Picks
    url: https://pick.test/feed
    mode: curated
    articles:
      - { url: https://pick.test/a/1, note: 推荐一, cover: assets/1.png }
      - { url: https://pick.test/a/2 }
`;

// ---------- 网络 fixture ----------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

type Route = [match: string | RegExp, handler: (url: string, init?: RequestInit) => Response | Promise<Response>];

function mockFetch(routes: Route[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const [match, handler] of routes) {
      const hit = typeof match === 'string' ? url.startsWith(match) : match.test(url);
      if (hit) return handler(url, init);
    }
    throw new Error(`未 mock 的请求：${url}`);
  }) as FetchFn;
  return { fn, calls };
}

const GH_USER = {
  login: 'octocat',
  name: 'The Octocat',
  avatar_url: 'https://avatars.test/u/1',
  bio: 'hi',
  company: '@github',
  blog: 'https://blog.test',
  location: 'SF',
  followers: 100,
  following: 5,
  public_repos: 8,
  html_url: 'https://github.com/octocat',
  node_id: 'should-be-dropped', // 白名单之外的字段应被丢弃
};

const GH_REPO_HELLO = {
  name: 'hello',
  full_name: 'octocat/hello',
  description: 'desc hello',
  html_url: 'https://github.com/octocat/hello',
  language: 'TypeScript',
  stargazers_count: 10,
  forks_count: 2,
  pushed_at: '2026-08-01T00:00:00Z',
  topics: ['a', 'b'],
  node_id: 'drop-me',
};

const GH_REPO_WORLD = {
  ...GH_REPO_HELLO,
  name: 'world',
  full_name: 'octocat/world',
  description: 'desc world',
};

const GH_CONTRIB_RESP = {
  data: {
    user: {
      contributionsCollection: {
        contributionCalendar: {
          totalContributions: 42,
          weeks: [
            { contributionDays: [{ contributionCount: 3, date: '2026-08-01' }] },
          ],
        },
      },
    },
  },
};

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Blog</title>
<item>
  <title>First</title>
  <link>https://blog.test/1</link>
  <pubDate>Mon, 10 Aug 2026 10:00:00 GMT</pubDate>
  <description><![CDATA[<p>Hello <b>world</b> &amp; friends</p>]]></description>
</item>
<item>
  <title>Second</title>
  <link>https://blog.test/2</link>
  <pubDate>Sun, 09 Aug 2026 10:00:00 GMT</pubDate>
  <description>plain summary</description>
</item>
<item>
  <title>Third</title>
  <link>https://blog.test/3</link>
  <pubDate>Sat, 08 Aug 2026 10:00:00 GMT</pubDate>
</item>
</channel></rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>AtomBlog</title>
<entry>
  <title>Atom One</title>
  <link href="https://atom.test/1"/>
  <published>2026-08-10T00:00:00Z</published>
  <summary type="html">&lt;p&gt;Atom summary&lt;/p&gt;</summary>
</entry>
<entry>
  <title>Atom Two</title>
  <link href="https://atom.test/2"/>
  <updated>2026-08-09T00:00:00Z</updated>
  <content>content two</content>
</entry>
</feed>`;

const PICKS_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Picks</title>
<item>
  <title>Picked One</title>
  <link>https://pick.test/a/1</link>
  <pubDate>Mon, 03 Aug 2026 00:00:00 GMT</pubDate>
  <description>feed 里的摘要</description>
</item>
<item>
  <title>Other</title>
  <link>https://pick.test/other</link>
  <pubDate>Sun, 02 Aug 2026 00:00:00 GMT</pubDate>
</item>
</channel></rss>`;

const ARTICLE_PAGE_A2 = `<html><head>
<title>Page Two - Site</title>
<meta property="og:title" content="Page Two OG">
<meta name="description" content="desc two &amp; more">
</head><body><p>这段正文不应赢过 meta description</p></body></html>`;

const ARTICLE_PAGE_A1 = `<html><head><title>Article One</title></head>
<body><nav>menu</nav><p>这是第一段正文，应该被拿来当摘要。</p><p>第二段</p></body></html>`;

/** 全部依赖的 happy-path 路由 */
function happyRoutes(): Route[] {
  return [
    ['https://api.github.com/users/octocat', () => jsonResponse(GH_USER)],
    ['https://api.github.com/repos/octocat/hello', () => jsonResponse(GH_REPO_HELLO)],
    ['https://api.github.com/repos/octocat/world', () => jsonResponse(GH_REPO_WORLD)],
    ['https://api.github.com/graphql', () => jsonResponse(GH_CONTRIB_RESP)],
    ['https://blog.test/feed.xml', () => textResponse(RSS_XML)],
    ['https://pick.test/feed', () => textResponse(PICKS_FEED_XML)],
    ['https://pick.test/a/2', () => textResponse(ARTICLE_PAGE_A2)],
  ];
}

function opts(fetchFn: FetchFn, extra: Partial<PrefetchOptions> = {}): PrefetchOptions {
  return {
    dataDir,
    cacheDir,
    fetchFn,
    now: () => T0,
    token: 'TEST_TOKEN',
    ci: false,
    ...extra,
  };
}

function readGithub(): Required<GithubCache> {
  return JSON.parse(readFileSync(path.join(cacheDir, 'github.json'), 'utf8'));
}
function readRss(): RssCache {
  return JSON.parse(readFileSync(path.join(cacheDir, 'rss.json'), 'utf8'));
}
function readMeta(): {
  updated_at: number;
  ok: boolean;
  blocks: { key: string; status: string; error: string | null }[];
} {
  return JSON.parse(readFileSync(path.join(cacheDir, 'meta.json'), 'utf8'));
}

/** 播种一份「全部新鲜」的缓存 */
function seedFreshCaches(at: number) {
  mkdirSync(cacheDir, { recursive: true });
  const fresh = <T>(data: T) => ({ data, fetched_at: at, error: null, failed_at: null });
  writeFileSync(
    path.join(cacheDir, 'github.json'),
    JSON.stringify({
      user: fresh({ login: 'octocat' }),
      pinned: fresh([{ full_name: 'octocat/hello' }]),
      contributions: fresh({ total: 1, weeks: [] }),
    })
  );
  writeFileSync(
    path.join(cacheDir, 'rss.json'),
    JSON.stringify({
      sources: [
        { name: 'Blog', url: 'https://blog.test/feed.xml', mode: 'latest', entries: [{ title: 'old' }], fetched_at: at, error: null, failed_at: null },
        { name: 'Picks', url: 'https://pick.test/feed', mode: 'curated', entries: [{ title: 'old' }], fetched_at: at, error: null, failed_at: null },
      ],
    })
  );
}

// ---------- GitHub 数据块 ----------

describe('GitHub 数据块', () => {
  it('用户/pinned/贡献图正常解析并写入缓存', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn, calls } = mockFetch(happyRoutes());
    const result = await runPrefetch(opts(fn));

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);

    const gh = readGithub();
    // 用户：白名单字段保留，node_id 等被丢弃
    expect(gh.user.error).toBeNull();
    expect(gh.user.fetched_at).toBe(T0);
    expect(gh.user.data).toMatchObject({ login: 'octocat', name: 'The Octocat', followers: 100 });
    expect(gh.user.data).not.toHaveProperty('node_id');

    // pinned：顺序保持，note 合并
    expect(gh.pinned.data).toHaveLength(2);
    expect(gh.pinned.data![0]).toMatchObject({ full_name: 'octocat/hello', note: '我的项目' });
    expect(gh.pinned.data![1]).toMatchObject({ full_name: 'octocat/world', note: null });
    expect(gh.pinned.data![0]).not.toHaveProperty('node_id');

    // 贡献图：{ total, weeks }
    expect(gh.contributions.error).toBeNull();
    expect(gh.contributions.data).toMatchObject({ total: 42 });
    expect(gh.contributions.data!.weeks[0].contributionDays[0]).toEqual({
      contributionCount: 3,
      date: '2026-08-01',
    });

    // REST 带 token；GraphQL 走 POST + variables
    const restCall = calls.find((c) => c.url.startsWith('https://api.github.com/users/'));
    expect((restCall!.init?.headers as Record<string, string>).Authorization).toBe('Bearer TEST_TOKEN');
    const gqlCall = calls.find((c) => c.url === 'https://api.github.com/graphql');
    expect(gqlCall!.init?.method).toBe('POST');
    const gqlBody = JSON.parse(String(gqlCall!.init?.body));
    expect(gqlBody.query).toContain('contributionsCollection');
    expect(gqlBody.variables).toEqual({ login: 'octocat' });

    // meta.json 汇总
    const meta = readMeta();
    expect(meta.ok).toBe(true);
    expect(meta.updated_at).toBe(T0);
    const keys = meta.blocks.map((b) => b.key);
    expect(keys).toContain('github.user');
    expect(keys).toContain('github.pinned');
    expect(keys).toContain('github.contributions');
    expect(keys).toContain('rss.Blog');
    expect(keys).toContain('rss.Picks');
    expect(meta.blocks.every((b) => b.status === 'fresh')).toBe(true);
  });

  it('本地无 token：REST 匿名；贡献图写占位状态，不阻断', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn, calls } = mockFetch(happyRoutes());
    const result = await runPrefetch(opts(fn, { token: null }));

    expect(result.ok).toBe(true);
    // REST 匿名：无 Authorization 头
    const restCall = calls.find((c) => c.url.startsWith('https://api.github.com/users/'));
    expect((restCall!.init?.headers as Record<string, string>).Authorization).toBeUndefined();
    // GraphQL 不应被请求
    expect(calls.some((c) => c.url.includes('graphql'))).toBe(false);

    const gh = readGithub();
    expect(gh.contributions.data).toBeNull();
    expect(gh.contributions.error).toMatch(/GH_PAT/);
    expect(result.blocks.find((b) => b.key === 'github.contributions')!.status).toBe('placeholder');
  });

  it('CI 上无 token：贡献图记为失败块并产生 warning（但其余正常仍零退出）', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch(happyRoutes());
    const result = await runPrefetch(opts(fn, { token: null, ci: true }));

    expect(result.ok).toBe(true);
    const block = result.blocks.find((b) => b.key === 'github.contributions')!;
    expect(block.status).toBe('error');
    expect(result.warnings.join('\n')).toMatch(/贡献图|contributions/);
  });

  it('GraphQL 返回 errors 且无旧缓存 → 该块失败，但整体部分成功仍 ok', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://api.github.com/graphql', () => jsonResponse({ errors: [{ message: 'Bad credentials' }] })],
      ...happyRoutes().filter(([m]) => m !== 'https://api.github.com/graphql'),
    ]);
    const result = await runPrefetch(opts(fn));

    expect(result.ok).toBe(true);
    const gh = readGithub();
    expect(gh.contributions.data).toBeNull();
    expect(gh.contributions.error).toMatch(/Bad credentials/);
    expect(result.blocks.find((b) => b.key === 'github.contributions')!.status).toBe('error');
  });
});

// ---------- RSS 抓取 ----------

describe('RSS 抓取', () => {
  it('latest 模式：取前 N 条，摘要去 HTML，封面用源级声明值', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch(happyRoutes());
    await runPrefetch(opts(fn));

    const rss = readRss();
    const blog = rss.sources.find((s) => s.name === 'Blog')!;
    expect(blog.mode).toBe('latest');
    expect(blog.error).toBeNull();
    expect(blog.fetched_at).toBe(T0);
    // latest: 2 → 只取前 2 条（feed 共 3 条）
    expect(blog.entries).toHaveLength(2);
    expect(blog.entries[0]).toEqual({
      title: 'First',
      link: 'https://blog.test/1',
      published: '2026-08-10T10:00:00.000Z',
      summary: 'Hello world & friends',
      cover: 'assets/c.png',
      note: null,
    });
    expect(blog.entries[1].title).toBe('Second');
  });

  it('摘要去 HTML 标签并按码点截 300 字符', async () => {
    const longXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>L</title>
<item><title>Long</title><link>https://blog.test/long</link>
<pubDate>Mon, 10 Aug 2026 10:00:00 GMT</pubDate>
<description><![CDATA[<p>${'汉'.repeat(400)}</p>]]></description></item>
</channel></rss>`;
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://blog.test/feed.xml', () => textResponse(longXml)],
      ...happyRoutes().filter(([m]) => m !== 'https://blog.test/feed.xml'),
    ]);
    await runPrefetch(opts(fn));

    const blog = readRss().sources.find((s) => s.name === 'Blog')!;
    expect([...blog.entries[0].summary]).toHaveLength(300);
    expect(blog.entries[0].summary).not.toMatch(/[<>]/);
  });

  it('Atom feed 解析（published/updated、summary）', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://blog.test/feed.xml', () => textResponse(ATOM_XML)],
      ...happyRoutes().filter(([m]) => m !== 'https://blog.test/feed.xml'),
    ]);
    await runPrefetch(opts(fn));

    const blog = readRss().sources.find((s) => s.name === 'Blog')!;
    expect(blog.entries[0]).toMatchObject({
      title: 'Atom One',
      link: 'https://atom.test/1',
      published: '2026-08-10T00:00:00.000Z',
      summary: 'Atom summary',
    });
    // 第二条只有 updated
    expect(blog.entries[1].published).toBe('2026-08-09T00:00:00.000Z');
  });

  it('curated 模式：feed 内匹配用 feed 数据，保留 articles 顺序/note/cover', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn, calls } = mockFetch(happyRoutes());
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.error).toBeNull();
    expect(picks.entries).toHaveLength(2);
    // a/1 在 feed 内命中：用 feed 的标题/摘要/时间 + 配置的 note/cover
    expect(picks.entries[0]).toEqual({
      title: 'Picked One',
      link: 'https://pick.test/a/1',
      published: '2026-08-03T00:00:00.000Z',
      summary: 'feed 里的摘要',
      cover: 'assets/1.png',
      note: '推荐一',
    });
    // 命中 feed 的文章不应再抓页面
    expect(calls.some((c) => c.url === 'https://pick.test/a/1')).toBe(false);
  });

  it('curated 模式：feed 内匹配不到则抓文章页（og:title / meta description）', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn, calls } = mockFetch(happyRoutes());
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.entries[1]).toEqual({
      title: 'Page Two OG',
      link: 'https://pick.test/a/2',
      published: null,
      summary: 'desc two & more',
      cover: null,
      note: null,
    });
    expect(calls.some((c) => c.url === 'https://pick.test/a/2')).toBe(true);
  });

  it('curated 模式：feed 挂了仍可逐条抓文章页补全（首段文本兜底摘要）', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://pick.test/feed', () => textResponse('oops', 500)],
      ['https://pick.test/a/1', () => textResponse(ARTICLE_PAGE_A1)],
      ...happyRoutes().filter(([m]) => typeof m !== 'string' || m !== 'https://pick.test/feed'),
    ]);
    const result = await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    // 两条都通过文章页补全 → 不算失败
    expect(picks.error).toBeNull();
    expect(picks.entries[0]).toMatchObject({
      title: 'Article One',
      summary: '这是第一段正文，应该被拿来当摘要。',
      note: '推荐一',
      cover: 'assets/1.png',
    });
    expect(picks.entries[1]).toMatchObject({ title: 'Page Two OG' });
    expect(result.blocks.find((b) => b.key === 'rss.Picks')!.status).toBe('fresh');
  });

  it('curated 模式：文章页也失败 → 降级占位条目，源记 partial', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://pick.test/a/2', () => textResponse('server error', 500)],
      ...happyRoutes().filter(([m]) => m !== 'https://pick.test/a/2'),
    ]);
    const result = await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.entries).toHaveLength(2);
    expect(picks.entries[0].title).toBe('Picked One'); // 正常条目不受影响
    expect(picks.entries[1]).toMatchObject({
      title: 'https://pick.test/a/2', // 占位：标题退化为 URL
      link: 'https://pick.test/a/2',
      summary: '',
      published: null,
    });
    expect(picks.error).toMatch(/a\/2/);
    expect(result.blocks.find((b) => b.key === 'rss.Picks')!.status).toBe('partial');
    expect(result.ok).toBe(true);
  });
});

// ---------- 缓存 / TTL / 降级 ----------

describe('缓存与 TTL', () => {
  it('TTL（1h）内命中缓存，不发任何请求', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    seedFreshCaches(T0 - 10 * 60_000); // 10 分钟前
    const { fn, calls } = mockFetch([]); // 任何请求都抛错
    const result = await runPrefetch(opts(fn));

    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.blocks.every((b) => b.status === 'cached')).toBe(true);
    // 缓存原样保留
    expect(readGithub().user.fetched_at).toBe(T0 - 10 * 60_000);
  });

  it('上次失败的块 15 分钟内不重试', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    seedFreshCaches(T0 - 10 * 60_000);
    const gh = JSON.parse(readFileSync(path.join(cacheDir, 'github.json'), 'utf8'));
    gh.user = { data: null, fetched_at: null, error: 'old boom', failed_at: T0 - 10 * 60_000 };
    writeFileSync(path.join(cacheDir, 'github.json'), JSON.stringify(gh));

    const { fn, calls } = mockFetch(happyRoutes());
    const result = await runPrefetch(opts(fn));

    expect(calls.some((c) => c.url.startsWith('https://api.github.com/users/'))).toBe(false);
    const block = result.blocks.find((b) => b.key === 'github.user')!;
    expect(block.status).toBe('error'); // 退避中保持失败状态
    expect(result.ok).toBe(true); // 其余块有缓存，整体零退出
    expect(readGithub().user.error).toBe('old boom');
  });

  it('上次失败的块超过 15 分钟后重试并可成功', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    seedFreshCaches(T0 - 10 * 60_000);
    const gh = JSON.parse(readFileSync(path.join(cacheDir, 'github.json'), 'utf8'));
    gh.user = { data: null, fetched_at: null, error: 'old boom', failed_at: T0 - (TTL_FAIL_MS + 60_000) };
    writeFileSync(path.join(cacheDir, 'github.json'), JSON.stringify(gh));

    const { fn, calls } = mockFetch(happyRoutes());
    const result = await runPrefetch(opts(fn));

    expect(calls.some((c) => c.url.startsWith('https://api.github.com/users/'))).toBe(true);
    const user = readGithub().user;
    expect(user.error).toBeNull();
    expect(user.data).toMatchObject({ login: 'octocat' });
    expect(result.blocks.find((b) => b.key === 'github.user')!.status).toBe('fresh');
  });

  it('抓取失败降级旧缓存：数据保留、error 记录、failed_at 更新', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    seedFreshCaches(T0 - 2 * TTL_OK_MS); // 已过期
    const { fn } = mockFetch([
      ['https://api.github.com/users/octocat', () => jsonResponse({ message: 'rate limited' }, 403)],
      ...happyRoutes().filter(([m]) => m !== 'https://api.github.com/users/octocat'),
    ]);
    const result = await runPrefetch(opts(fn));

    const user = readGithub().user;
    expect(user.data).toEqual({ login: 'octocat' }); // 旧数据保留
    expect(user.fetched_at).toBe(T0 - 2 * TTL_OK_MS); // 数据时间不变
    expect(user.error).toMatch(/403/);
    expect(user.failed_at).toBe(T0);
    expect(result.blocks.find((b) => b.key === 'github.user')!.status).toBe('stale');
    expect(result.ok).toBe(true);
  });

  it('--force 忽略 TTL 强制全量抓取', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    seedFreshCaches(T0 - 10 * 60_000);
    const { fn, calls } = mockFetch(happyRoutes());
    const result = await runPrefetch(opts(fn, { force: true }));

    expect(calls.length).toBeGreaterThan(0);
    expect(result.blocks.every((b) => b.status === 'fresh')).toBe(true);
    expect(readGithub().user.fetched_at).toBe(T0);
  });
});

// ---------- 退出码聚合 ----------

describe('退出码聚合', () => {
  it('所有数据块失败且无任何旧缓存 → ok=false', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    // CI 无 token：贡献图也算失败块
    const result = await runPrefetch(opts(mockFetch([]).fn, { token: null, ci: true }));

    expect(result.ok).toBe(false);
    expect(result.blocks.every((b) => b.status === 'error')).toBe(true);
    // 失败块也写入缓存（data null + error），供退避与诊断
    const gh = readGithub();
    expect(gh.user.data).toBeNull();
    expect(gh.user.error).toBeTruthy();
    const rss = readRss();
    expect(rss.sources.every((s) => s.error && s.entries.length === 0)).toBe(true);
    expect(readMeta().ok).toBe(false);
  });

  it('部分失败 → ok=true，warning 列出失败块', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://api.github.com/users/octocat', () => jsonResponse({}, 500)],
      ...happyRoutes().filter(([m]) => m !== 'https://api.github.com/users/octocat'),
    ]);
    const result = await runPrefetch(opts(fn));

    expect(result.ok).toBe(true);
    expect(result.blocks.find((b) => b.key === 'github.user')!.status).toBe('error');
    expect(result.warnings.join('\n')).toMatch(/github\.user/);
  });

  it('单个 RSS 源失败不影响其他源', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch([
      ['https://blog.test/feed.xml', () => textResponse('down', 502)],
      ...happyRoutes().filter(([m]) => m !== 'https://blog.test/feed.xml'),
    ]);
    const result = await runPrefetch(opts(fn));

    const rss = readRss();
    const blog = rss.sources.find((s) => s.name === 'Blog')!;
    const picks = rss.sources.find((s) => s.name === 'Picks')!;
    expect(blog.entries).toEqual([]);
    expect(blog.error).toMatch(/502/);
    expect(picks.error).toBeNull();
    expect(result.blocks.find((b) => b.key === 'rss.Blog')!.status).toBe('error');
    expect(result.blocks.find((b) => b.key === 'rss.Picks')!.status).toBe('fresh');
    expect(result.ok).toBe(true);
  });

  it('失败源写盘后再跑：空 entries 不被误判为有缓存数据（仍 error、仍缺数即报错）', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    // 第一次：全部失败（CI 无 token，贡献图也算失败块）
    await runPrefetch(opts(mockFetch([]).fn, { token: null, ci: true }));
    // 第二次：失败块在 15min 退避内不发请求，状态必须仍是 error
    const { fn, calls } = mockFetch([]);
    const result = await runPrefetch(opts(fn, { token: null, ci: true }));

    expect(calls).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.blocks.every((b) => b.status === 'error')).toBe(true);
  });

  it('placeholder 是中性块：其余全失败时本地无 PAT 也不救命（ok=false）', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    // 本地无 token：贡献图 placeholder；但其余块全部失败且无缓存 → 缺数即报错
    const result = await runPrefetch(opts(mockFetch([]).fn, { token: null, ci: false }));

    expect(result.blocks.find((b) => b.key === 'github.contributions')!.status).toBe('placeholder');
    expect(result.ok).toBe(false);
  });
});

// ---------- 并发与超时 ----------

describe('并发与超时', () => {
  const SITE_GH_ONLY = `
site: { title: T }
profile: { name: N }
github: { username: octocat, show_contributions: false }
rss: { enabled: true }
`;

  it('源间并发上限 4', async () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({
      name: `S${i}`, url: `https://s${i}.test/feed`, mode: 'latest' as const, latest: 1,
    }));
    const rssYaml = 'sources:\n' + sources
      .map((s) => `  - { name: ${s.name}, url: "${s.url}", mode: latest, latest: 1 }`)
      .join('\n');
    writeConfig(SITE_GH_ONLY, rssYaml);

    let inflight = 0;
    let maxInflight = 0;
    const fn = (async (url: string) => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 30));
      inflight -= 1;
      if (url.startsWith('https://api.github.com')) return jsonResponse(GH_USER);
      return textResponse(RSS_XML);
    }) as FetchFn;

    const result = await runPrefetch(opts(fn));
    expect(result.ok).toBe(true);
    expect(maxInflight).toBeLessThanOrEqual(4);
    expect(maxInflight).toBeGreaterThan(1); // 确实发生了并发
    const rss = readRss();
    expect(rss.sources).toHaveLength(6);
    expect(rss.sources.every((s) => s.error === null)).toBe(true);
  });

  it('总超时后未完成的块记为超时失败，已完成块不受影响', async () => {
    writeConfig(SITE_FULL, RSS_FULL.replace('latest: 2', 'latest: 1'));
    const slowRoutes: Route[] = happyRoutes().map(([m, h]) =>
      m === 'https://blog.test/feed.xml'
        ? [m, async () => { await new Promise((r) => setTimeout(r, 500)); return h(''); }]
        : [m, h]
    );
    const { fn } = mockFetch(slowRoutes);
    const result = await runPrefetch(opts(fn, { totalTimeoutMs: 120 }));

    const blog = result.blocks.find((b) => b.key === 'rss.Blog')!;
    expect(blog.status).toBe('error');
    expect(blog.error).toMatch(/超时|timeout/i);
    expect(result.blocks.find((b) => b.key === 'github.user')!.status).toBe('fresh');
    expect(result.ok).toBe(true);
  }, 10_000);
});

// ---------- curated 封面抓取（og:image，spec 05） ----------

describe('curated 封面抓取（og:image）', () => {
  const OG_PAGE = `<html><head>
<title>OG Post</title>
<meta property="og:title" content="OG Post">
<meta property="og:image" content="https://cdn.test/og.jpg">
<meta name="twitter:image" content="https://cdn.test/tw.jpg">
</head><body><p>这段正文足够长，足够长，足够长，足够长，足够长，足够长，足够长，足够长。</p></body></html>`;
  const TW_PAGE = `<html><head>
<title>TW Post</title>
<meta name="twitter:image" content="https://cdn.test/tw.jpg">
</head><body><p>这段正文足够长，足够长，足够长，足够长，足够长，足够长，足够长，足够长。</p></body></html>`;
  const IMG_PAGE = `<html><head><title>Img Post</title></head>
<body><p>这段正文足够长，足够长，足够长，足够长，足够长，足够长，足够长，足够长。</p><img src="/static/photo.png"></body></html>`;

  /** 单 curated 源、两篇文章（均不在 feed 内），feed 本身可用 */
  const curatedYaml = (articles: string) => `
display: grouped
sources:
  - name: Picks
    url: https://pick.test/feed
    mode: curated
    articles:
${articles}
`;

  it('未声明 cover：抓文章页提取 og:image 作封面（og:image 优先于 twitter:image）', async () => {
    writeConfig(
      SITE_FULL,
      curatedYaml('      - { url: https://pick.test/a/og }')
    );
    const { fn } = mockFetch([
      ['https://pick.test/a/og', () => textResponse(OG_PAGE)],
      ...happyRoutes().filter(([m]) => m !== 'https://pick.test/a/2'),
    ]);
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.entries[0].cover).toBe('https://cdn.test/og.jpg');
  });

  it('og:image 缺失时回退 twitter:image，再回退正文首个 img（相对地址按页面 URL 解析）', async () => {
    writeConfig(
      SITE_FULL,
      curatedYaml('      - { url: https://pick.test/a/tw }\n      - { url: https://pick.test/a/img }')
    );
    const { fn } = mockFetch([
      ['https://pick.test/a/tw', () => textResponse(TW_PAGE)],
      ['https://pick.test/a/img', () => textResponse(IMG_PAGE)],
      ...happyRoutes().filter(([m]) => m !== 'https://pick.test/a/2'),
    ]);
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.entries[0].cover).toBe('https://cdn.test/tw.jpg');
    expect(picks.entries[1].cover).toBe('https://pick.test/static/photo.png');
  });

  it('显式声明的 cover 优先于 og:image', async () => {
    writeConfig(
      SITE_FULL,
      curatedYaml('      - { url: https://pick.test/a/og, cover: assets/explicit.png }')
    );
    const { fn } = mockFetch([
      ['https://pick.test/a/og', () => textResponse(OG_PAGE)],
      ...happyRoutes().filter(([m]) => m !== 'https://pick.test/a/2'),
    ]);
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.entries[0].cover).toBe('assets/explicit.png');
  });

  it('feed 命中但未声明封面：额外抓文章页补 og:image，标题/摘要仍用 feed 数据', async () => {
    writeConfig(SITE_FULL, RSS_FULL.replace(', cover: assets/1.png', ''));
    const { fn, calls } = mockFetch([
      ['https://pick.test/a/1', () => textResponse(OG_PAGE)],
      ...happyRoutes(),
    ]);
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(calls.some((c) => c.url === 'https://pick.test/a/1')).toBe(true);
    expect(picks.entries[0]).toEqual({
      title: 'Picked One', // feed 数据优先
      link: 'https://pick.test/a/1',
      published: '2026-08-03T00:00:00.000Z',
      summary: 'feed 里的摘要',
      cover: 'https://cdn.test/og.jpg', // 文章页补的封面
      note: '推荐一',
    });
  });

  it('feed 命中时封面补抓失败不致命：条目保留 feed 数据，源不记 partial', async () => {
    writeConfig(SITE_FULL, RSS_FULL.replace(', cover: assets/1.png', ''));
    const { fn } = mockFetch([
      ['https://pick.test/a/1', () => textResponse('boom', 500)],
      ...happyRoutes(),
    ]);
    const result = await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.error).toBeNull();
    expect(picks.entries[0]).toMatchObject({ title: 'Picked One', cover: null });
    expect(result.blocks.find((b) => b.key === 'rss.Picks')!.status).toBe('fresh');
  });

  it('文章页无任何封面线索：cover 为 null，渲染纯文字卡片', async () => {
    writeConfig(SITE_FULL, RSS_FULL);
    const { fn } = mockFetch(happyRoutes());
    await runPrefetch(opts(fn));

    const picks = readRss().sources.find((s) => s.name === 'Picks')!;
    expect(picks.entries[1].cover).toBeNull();
  });
});

// ---------- 其他行为与工具函数 ----------

describe('其他行为', () => {
  it('rss.enabled=false 时不写 rss.json，只跑 github 块', async () => {
    writeConfig(`
site: { title: T }
profile: { name: N }
github: { username: octocat, show_contributions: false }
rss: { enabled: false }
`);
    const { fn } = mockFetch([['https://api.github.com/users/octocat', () => jsonResponse(GH_USER)]]);
    const result = await runPrefetch(opts(fn));

    expect(result.ok).toBe(true);
    expect(existsSync(path.join(cacheDir, 'rss.json'))).toBe(false);
    expect(result.blocks.map((b) => b.key)).toEqual(['github.user']);
  });

  it('rss.enabled=true 但 rss.yaml 缺失时抛中文配置错误', async () => {
    writeConfig(`
site: { title: T }
profile: { name: N }
github: { username: octocat, show_contributions: false }
rss: { enabled: true }
`);
    const { fn } = mockFetch([['https://api.github.com/users/octocat', () => jsonResponse(GH_USER)]]);
    await expect(runPrefetch(opts(fn))).rejects.toThrow(/rss\.yaml/);
  });

  it('stripHtml：去 script/标签、解码实体、压缩空白', () => {
    expect(stripHtml('<script>var x=1;</script><p> Hello <b>world</b>  &amp; &lt;em&gt; &#65; </p>'))
      .toBe('Hello world & <em> A');
    expect(stripHtml('plain')).toBe('plain');
  });

  it('truncateText：按码点截断，不劈开代理对', () => {
    expect([...truncateText('a'.repeat(400), 300)]).toHaveLength(300);
    const t = truncateText('😀'.repeat(400), 300);
    expect([...t]).toHaveLength(300);
    expect(t.endsWith('😀')).toBe(true);
    expect(truncateText('短文本', 300)).toBe('短文本');
  });
});

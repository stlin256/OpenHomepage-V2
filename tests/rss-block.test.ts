import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadRssCache,
  coverUrl,
  formatDay,
  sortByDateDesc,
  sortMixed,
  buildRssView,
  CARD_SUMMARY_MAX,
  type RssCardView,
} from '../src/lib/rss-block.ts';
import type { RssConfig } from '../src/lib/config.ts';
import type { RssCache, RssEntry } from '../src/lib/prefetch.ts';

function entry(over: Partial<RssEntry> = {}): RssEntry {
  return {
    title: '标题',
    link: 'https://a.b/p',
    published: '2026-08-01T00:00:00.000Z',
    summary: '摘要',
    cover: null,
    note: null,
    ...over,
  };
}

function card(over: Partial<RssCardView> = {}): RssCardView {
  return {
    title: 't',
    link: 'https://a.b',
    source: 's',
    published: '2026-08-01T00:00:00.000Z',
    day: '2026-08-01',
    summary: '',
    cover: null,
    note: null,
    weight: 1,
    ...over,
  };
}

describe('loadRssCache', () => {
  it('正常读取 rss.json；缺失/损坏返回 null + warning', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-rss-'));
    try {
      writeFileSync(path.join(dir, 'rss.json'), '{"sources":[]}');
      expect(loadRssCache(dir)).toEqual({ sources: [] });
      writeFileSync(path.join(dir, 'rss.json'), 'oops');
      const warn = vi.fn();
      expect(loadRssCache(dir, warn)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const warn = vi.fn();
    expect(loadRssCache('C:/不存在', warn)).toBeNull();
    expect(warn.mock.calls[0][0]).toContain('rss.json');
  });
});

describe('coverUrl / formatDay', () => {
  it('外部 URL 原样；本地 assets 路径补 / 前缀', () => {
    expect(coverUrl('https://a.b/c.png')).toBe('https://a.b/c.png');
    expect(coverUrl('assets/rss/x.png')).toBe('/assets/rss/x.png');
    expect(coverUrl('/assets/x.png')).toBe('/assets/x.png');
    expect(coverUrl(null)).toBeNull();
  });

  it('ISO → YYYY-MM-DD；非法/空 → null', () => {
    expect(formatDay('2026-08-22T14:02:43.997Z')).toBe('2026-08-22');
    expect(formatDay('not-a-date')).toBeNull();
    expect(formatDay(null)).toBeNull();
  });
});

describe('sortByDateDesc / sortMixed', () => {
  it('sortByDateDesc：时间倒序，无日期排最后，不改入参', () => {
    const a = card({ published: '2026-01-01T00:00:00Z' });
    const b = card({ published: '2026-03-01T00:00:00Z' });
    const c = card({ published: null, day: null });
    const input = [a, c, b];
    expect(sortByDateDesc(input)).toEqual([b, a, c]);
    expect(input).toEqual([a, c, b]);
  });

  it('sortMixed：权重降序优先', () => {
    const low = card({ weight: 1, published: '2026-08-20T00:00:00Z' });
    const high = card({ weight: 3, published: '2026-08-01T00:00:00Z' });
    expect(sortMixed([low, high])).toEqual([high, low]);
  });

  it('sortMixed：同权重按时间倒序', () => {
    const old = card({ weight: 2, published: '2026-08-01T00:00:00Z' });
    const fresh = card({ weight: 2, published: '2026-08-22T00:00:00Z' });
    expect(sortMixed([old, fresh])).toEqual([fresh, old]);
  });

  it('sortMixed：无日期的排最后（先于权重比较）', () => {
    const undated = card({ weight: 9, published: null, day: null });
    const dated = card({ weight: 1, published: '2026-01-01T00:00:00Z' });
    expect(sortMixed([undated, dated])).toEqual([dated, undated]);
  });
});

describe('buildRssView', () => {
  const config: RssConfig = {
    display: 'grouped',
    sources: [
      { name: '博客', url: 'https://a.b/feed', mode: 'latest', latest: 5, weight: 2 },
      { name: '精选', url: 'https://c.d/rss', mode: 'curated', weight: 3 },
    ],
  };
  const cache: RssCache = {
    sources: [
      {
        name: '博客',
        url: 'https://a.b/feed',
        mode: 'latest',
        entries: [
          entry({ title: '旧文', published: '2026-01-01T00:00:00.000Z' }),
          entry({ title: '新文', published: '2026-08-01T00:00:00.000Z' }),
        ],
        fetched_at: 1700000000000,
        error: null,
        failed_at: null,
      },
      {
        name: '精选',
        url: 'https://c.d/rss',
        mode: 'curated',
        entries: [
          entry({ title: '策展1', note: '推荐', published: null }),
          entry({ title: '策展2', published: '2025-05-01T00:00:00.000Z' }),
        ],
        fetched_at: 1700000000000,
        error: 'partial: 部分失败',
        failed_at: 1700000001000,
      },
    ],
  };

  it('grouped：栏目顺序 = sources 顺序；latest 栏内时间倒序', () => {
    const v = buildRssView(cache, config)!;
    expect(v.display).toBe('grouped');
    if (v.display !== 'grouped') return;
    expect(v.columns.map((c) => c.name)).toEqual(['博客', '精选']);
    expect(v.columns[0].cards.map((c) => c.title)).toEqual(['新文', '旧文']);
  });

  it('grouped：curated 保持配置顺序（不按时间重排）；stale 标记', () => {
    const v = buildRssView(cache, config)!;
    if (v.display !== 'grouped') throw new Error('unreachable');
    expect(v.columns[1].cards.map((c) => c.title)).toEqual(['策展1', '策展2']);
    expect(v.columns[1].stale).toBe(true);
    expect(v.columns[0].stale).toBe(false);
  });

  it('卡片字段：摘要两级、日期、封面、note、来源', () => {
    const longSummary = '字'.repeat(200);
    const c: RssCache = {
      sources: [
        {
          name: '博客',
          url: 'https://a.b/feed',
          mode: 'latest',
          entries: [entry({ summary: longSummary, cover: 'assets/x.png', note: '注' })],
          fetched_at: null,
          error: null,
          failed_at: null,
        },
      ],
    };
    const v = buildRssView(c, config)!;
    if (v.display !== 'grouped') throw new Error('unreachable');
    const cd = v.columns[0].cards[0];
    expect([...cd.summary]).toHaveLength(CARD_SUMMARY_MAX);
    expect(cd.day).toBe('2026-08-01');
    expect(cd.cover).toBe('/assets/x.png');
    expect(cd.note).toBe('注');
    expect(cd.source).toBe('博客');
  });

  it('mixed：跨源按 无日期最后 → 权重 → 时间 混排', () => {
    const v = buildRssView(cache, { ...config, display: 'mixed' })!;
    expect(v.display).toBe('mixed');
    if (v.display !== 'mixed') return;
    // 精选（w3，无日期/旧日期）无日期的排最后；剩下按权重：精选 策展2(w3) → 博客 新/旧(w2)
    expect(v.cards.map((c) => c.title)).toEqual(['策展2', '新文', '旧文', '策展1']);
    expect(v.stale).toBe(true);
    expect(v.fetchedAt).toBe(1700000000000);
  });

  it('空栏目丢弃；全部为空时 columns 为空数组', () => {
    const empty: RssCache = {
      sources: [
        { name: '博客', url: 'https://a.b/feed', mode: 'latest', entries: [], fetched_at: null, error: 'fetch failed', failed_at: 1 },
        { name: '精选', url: 'https://c.d/rss', mode: 'curated', entries: [], fetched_at: null, error: 'x', failed_at: 1 },
      ],
    };
    const v = buildRssView(empty, config)!;
    if (v.display !== 'grouped') throw new Error('unreachable');
    expect(v.columns).toEqual([]);
  });

  it('cache 为 null（.cache 缺失）→ 返回 null（组件渲染空态提示）', () => {
    expect(buildRssView(null, config)).toBeNull();
  });
});

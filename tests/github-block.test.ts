import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadGithubCache,
  mixHex,
  heatLevel,
  heatScale,
  buildHeatScales,
  contributionsView,
  pinnedView,
  buildGithubView,
  formatTimestamp,
  repoCardHtml,
  HEAT_LEVELS,
} from '../src/lib/github-block.ts';
import { DEFAULT_ACCENT } from '../src/lib/theme.ts';
import type { CacheBlock, Contributions, GithubPinnedRepo } from '../src/lib/prefetch.ts';

function block<T>(data: T | null, error: string | null = null): CacheBlock<T> {
  return { data, fetched_at: 1700000000000, error, failed_at: error ? 1700000001000 : null };
}

function weeksOf(counts: number[][]): Contributions['weeks'] {
  return counts.map((week) => ({
    contributionDays: week.map((count, i) => ({ contributionCount: count, date: `2026-01-0${i + 1}` })),
  }));
}

describe('loadGithubCache', () => {
  it('正常读取 github.json', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-gh-'));
    try {
      writeFileSync(path.join(dir, 'github.json'), '{"user":{"data":{"login":"u"},"fetched_at":1,"error":null,"failed_at":null}}');
      const cache = loadGithubCache(dir);
      expect(cache?.user?.data?.login).toBe('u');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('文件缺失/损坏时 warning 并返回 null', () => {
    const warn = vi.fn();
    expect(loadGithubCache('C:/不存在的目录', warn)).toBeNull();
    expect(warn.mock.calls[0][0]).toContain('github.json');

    const dir = mkdtempSync(path.join(tmpdir(), 'oh-gh-'));
    try {
      writeFileSync(path.join(dir, 'github.json'), '{bad json');
      expect(loadGithubCache(dir, warn)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('色阶 mixHex / heatScale', () => {
  it('mixHex 两端与中间值', () => {
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('heatScale 输出 5 档，末档为 accent 原色，档位递增变深', () => {
    const scale = heatScale(DEFAULT_ACCENT, '#ffffff');
    expect(scale).toHaveLength(HEAT_LEVELS);
    expect(scale[4]).toBe(DEFAULT_ACCENT);
    // 档位越高越接近 accent（红色通道递减：#3a7bd5 的 r=58 < 255）
    const rs = scale.map((c) => parseInt(c.slice(1, 3), 16));
    expect(rs[0]).toBeGreaterThan(rs[3]);
    expect(rs[3]).toBeGreaterThan(rs[4]);
  });

  it('buildHeatScales 明暗两套，深色档混向深底', () => {
    const { light, dark } = buildHeatScales('#3a7bd5', '#7aa5e0');
    expect(light[4]).toBe('#3a7bd5');
    expect(dark[4]).toBe('#7aa5e0');
    expect(dark[0]).not.toBe(light[0]);
  });
});

describe('heatLevel', () => {
  it('0 次为 0 档，非零按最大值分 4 档', () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(3, 10)).toBe(2);
    expect(heatLevel(5, 10)).toBe(2);
    expect(heatLevel(9, 10)).toBe(4);
    expect(heatLevel(10, 10)).toBe(4);
  });

  it('maxCount 为 0（全年无贡献）时所有天为 0 档', () => {
    expect(heatLevel(0, 0)).toBe(0);
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe('contributionsView', () => {
  it('无块 → hidden；data null + error → placeholder', () => {
    expect(contributionsView(undefined).kind).toBe('hidden');
    expect(
      contributionsView({ data: null, fetched_at: null, error: '本地未配置 GH_PAT', failed_at: null }).kind,
    ).toBe('placeholder');
    expect(contributionsView(block<Contributions>(null)).kind).toBe('hidden');
  });

  it('正常数据：周×7 补空、maxCount、stale 标记', () => {
    const data: Contributions = {
      total: 10,
      weeks: weeksOf([
        [1, 2, 3], // 首周 3 天 → 前补 4 空
        [0, 1, 2, 3, 4, 5, 6],
        [1, 1], // 末周 → 后补空
      ]),
    };
    const v = contributionsView(block(data));
    expect(v.kind).toBe('ok');
    if (v.kind !== 'ok') return;
    expect(v.total).toBe(10);
    expect(v.maxCount).toBe(6);
    expect(v.weeks).toHaveLength(3);
    expect(v.weeks[0].days).toHaveLength(7);
    expect(v.weeks[0].days.slice(0, 4)).toEqual([null, null, null, null]);
    expect(v.weeks[0].days[4]).toMatchObject({ count: 1, level: 1 });
    expect(v.weeks[2].days).toHaveLength(7);
    expect(v.weeks[2].days[6]).toBeNull();
    expect(v.stale).toBe(false);
  });

  it('error 非空且有旧数据 → 照常渲染 + stale', () => {
    const v = contributionsView(block({ total: 1, weeks: weeksOf([[1]]) }, 'HTTP 403'));
    expect(v.kind).toBe('ok');
    if (v.kind === 'ok') {
      expect(v.stale).toBe(true);
      expect(v.fetchedAt).toBe(1700000000000);
    }
  });
});

describe('pinnedView / buildGithubView', () => {
  const repo: GithubPinnedRepo = {
    name: 'repo-a',
    full_name: 'o/repo-a',
    description: '官方描述',
    html_url: 'https://github.com/o/repo-a',
    language: 'TypeScript',
    stargazers_count: 42,
    forks_count: 3,
    note: null,
  };

  it('无数据/空数组 → null', () => {
    expect(pinnedView(undefined)).toBeNull();
    expect(pinnedView(block<GithubPinnedRepo[]>(null, 'HTTP 404'))).toBeNull();
    expect(pinnedView(block([]))).toBeNull();
  });

  it('正常数据 + stale 标记', () => {
    const v = pinnedView(block([repo], 'HTTP 500'));
    expect(v).not.toBeNull();
    expect(v!.repos).toHaveLength(1);
    expect(v!.stale).toBe(true);
  });

  it('buildGithubView：cache 为 null 时返回 null', () => {
    expect(buildGithubView(null)).toBeNull();
    const v = buildGithubView({ pinned: block([repo]) });
    expect(v!.contributions.kind).toBe('hidden');
    expect(v!.pinned!.repos[0].full_name).toBe('o/repo-a');
  });
});

describe('formatTimestamp', () => {
  it('格式化为 YYYY-MM-DD HH:mm', () => {
    expect(formatTimestamp(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(formatTimestamp(1700000000000)).toMatch(/^202[34]-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('repoCardHtml', () => {
  const base: GithubPinnedRepo = {
    name: 'repo-a',
    full_name: 'o/repo-a',
    description: '官方描述',
    html_url: 'https://github.com/o/repo-a',
    language: 'Rust',
    stargazers_count: 7,
    note: null,
  };

  it('note 优先于官方描述；含名称/语言/star/链接', () => {
    const withNote = repoCardHtml({ ...base, note: '我的项目' });
    expect(withNote).toContain('我的项目');
    expect(withNote).not.toContain('官方描述');
    expect(withNote).toContain('o/repo-a');
    expect(withNote).toContain('Rust');
    expect(withNote).toContain('★ 7');
    expect(withNote).toContain('href="https://github.com/o/repo-a"');

    const withoutNote = repoCardHtml(base);
    expect(withoutNote).toContain('官方描述');
  });

  it('缺 html_url 时按 full_name 拼链接；转义 HTML', () => {
    const html = repoCardHtml({ ...base, html_url: undefined, description: '<b>x</b>' });
    expect(html).toContain('href="https://github.com/o/repo-a"');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

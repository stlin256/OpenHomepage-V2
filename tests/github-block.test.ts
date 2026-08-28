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
  languageColor,
  compactCount,
  formatCount,
  relativeUpdated,
  heatTooltip,
  monthLabels,
  weekdayLabels,
  HEAT_LEVELS,
  type HeatWeek,
} from '../src/lib/github-block.ts';
import { tooltipLeft } from '../src/lib/interactive.ts';
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

describe('repoCardHtml（GitHub 官网仓库卡 1:1）', () => {
  const NOW = Date.parse('2026-08-23T00:00:00Z');
  const base: GithubPinnedRepo = {
    name: 'repo-a',
    full_name: 'o/repo-a',
    description: '官方描述',
    html_url: 'https://github.com/o/repo-a',
    language: 'Rust',
    stargazers_count: 1234,
    forks_count: 56,
    updated_at: '2026-08-20T12:00:00Z',
    topics: ['llm', 'inference', 'rust'],
    note: null,
  };

  it('标题区：repo octicon + owner/repo（owner 普通色、repo 加粗主题色链接）', () => {
    const html = repoCardHtml(base, { lang: 'en', now: NOW });
    expect(html).toContain('gh-octicon');
    expect(html).toContain('viewBox="0 0 16 16"');
    expect(html).toContain('<span class="gh-repo-owner">o</span>');
    expect(html).toContain('<span class="gh-repo-name">repo-a</span>');
    expect(html).toContain('class="gh-repo-link" href="https://github.com/o/repo-a"');
    // 卡片本体不再是整卡链接，链接收敛到标题
    expect(html).toMatch(/^<div class="gh-repo">/);
  });

  it('note 优先于官方描述；转义 HTML', () => {
    const withNote = repoCardHtml({ ...base, note: '我的项目' }, { lang: 'en', now: NOW });
    expect(withNote).toContain('我的项目');
    expect(withNote).not.toContain('官方描述');

    const html = repoCardHtml({ ...base, description: '<b>x</b>' }, { lang: 'en', now: NOW });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });

  it('topics 渲染为 GitHub 风 pill 链接（最多 6 个）', () => {
    const html = repoCardHtml(base, { lang: 'en', now: NOW });
    expect(html).toContain('class="gh-topic" href="https://github.com/topics/llm"');
    expect(html).toContain('>inference</a>');
    const many = repoCardHtml(
      { ...base, topics: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'] },
      { lang: 'en', now: NOW }
    );
    expect(many.match(/gh-topic/g)).toHaveLength(6);
    // 无 topics 时不渲染 topics 行
    expect(repoCardHtml({ ...base, topics: [] }, { lang: 'en', now: NOW })).not.toContain('gh-repo-topics');
  });

  it('语言：官方语言色点 + 语言名；未知语言灰色；无语言不渲染', () => {
    const html = repoCardHtml(base, { lang: 'en', now: NOW });
    expect(html).toContain(`background-color:${languageColor('Rust')}`);
    expect(html).toContain('>Rust</span>');

    const unknown = repoCardHtml({ ...base, language: 'Brainfuck' }, { lang: 'en', now: NOW });
    expect(unknown).toContain('background-color:#8b949e');
    expect(unknown).toContain('>Brainfuck</span>');

    const none = repoCardHtml({ ...base, language: null }, { lang: 'en', now: NOW });
    expect(none).not.toContain('gh-lang-dot');
  });

  it('star/fork 用 octicon 图标 + 紧凑计数；Updated 相对时间双语', () => {
    const en = repoCardHtml(base, { lang: 'en', now: NOW });
    expect(en).toContain('gh-stars');
    expect(en).toContain('gh-forks');
    expect(en).toContain('1.2k'); // 1234 → 1.2k
    expect(en).toContain('>56<'); // fork 数原样
    expect(en).toContain('Updated 2 days ago');

    const zh = repoCardHtml(base, { lang: 'zh', now: NOW });
    expect(zh).toContain('更新于 2 天前');
  });

  it('缺 html_url 时按 full_name 拼链接；缺 updated_at 时不渲染更新行项', () => {
    const html = repoCardHtml(
      { ...base, html_url: undefined, updated_at: undefined },
      { lang: 'en', now: NOW }
    );
    expect(html).toContain('href="https://github.com/o/repo-a"');
    expect(html).not.toContain('gh-updated');
  });
});

describe('languageColor', () => {
  it('内置常见语言官方色（大小写不敏感）', () => {
    expect(languageColor('Python')).toBe('#3572A5');
    expect(languageColor('python')).toBe('#3572A5');
    expect(languageColor('JavaScript')).toBe('#f1e05a');
    expect(languageColor('TypeScript')).toBe('#3178c6');
    expect(languageColor('C++')).toBe('#f34b7d');
    expect(languageColor('Go')).toBe('#00ADD8');
    expect(languageColor('Rust')).toBe('#dea584');
    expect(languageColor('Java')).toBe('#b07219');
    expect(languageColor('Shell')).toBe('#89e051');
  });

  it('未知语言灰色；空值返回 null（不渲染）', () => {
    expect(languageColor('COBOL')).toBe('#8b949e');
    expect(languageColor(null)).toBeNull();
    expect(languageColor(undefined)).toBeNull();
    expect(languageColor('')).toBeNull();
  });
});

describe('compactCount / formatCount', () => {
  it('compactCount：<1000 原样；千位 k、百万 M（一位小数去尾）', () => {
    expect(compactCount(0)).toBe('0');
    expect(compactCount(999)).toBe('999');
    expect(compactCount(1000)).toBe('1k');
    expect(compactCount(1234)).toBe('1.2k');
    expect(compactCount(1299)).toBe('1.2k'); // floor 而非 round
    expect(compactCount(1_500_000)).toBe('1.5M');
    expect(compactCount(2_000_000)).toBe('2M');
  });

  it('formatCount：千分位逗号', () => {
    expect(formatCount(2467)).toBe('2,467');
    expect(formatCount(12)).toBe('12');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});

describe('relativeUpdated（GitHub 风相对时间）', () => {
  const NOW = Date.parse('2026-08-23T12:00:00Z');

  it('分钟/小时/天/超月 四档，双语', () => {
    expect(relativeUpdated('2026-08-23T11:59:30Z', NOW, 'en')).toBe('Updated just now');
    expect(relativeUpdated('2026-08-23T10:00:00Z', NOW, 'en')).toBe('Updated 2 hours ago');
    expect(relativeUpdated('2026-08-23T11:15:00Z', NOW, 'en')).toBe('Updated 45 minutes ago');
    expect(relativeUpdated('2026-08-20T12:00:00Z', NOW, 'en')).toBe('Updated 3 days ago');
    expect(relativeUpdated('2026-08-22T12:00:00Z', NOW, 'en')).toBe('Updated 1 day ago');
    expect(relativeUpdated('2026-01-01T00:00:00Z', NOW, 'en')).toBe('Updated on 2026-01-01');

    expect(relativeUpdated('2026-08-23T10:00:00Z', NOW, 'zh')).toBe('更新于 2 小时前');
    expect(relativeUpdated('2026-08-20T12:00:00Z', NOW, 'zh')).toBe('更新于 3 天前');
    expect(relativeUpdated('2026-01-01T00:00:00Z', NOW, 'zh')).toBe('更新于 2026-01-01');

    expect(relativeUpdated('2026-08-23T11:59:30Z', NOW, 'ja')).toBe('たった今更新');
    expect(relativeUpdated('2026-08-23T11:15:00Z', NOW, 'ja')).toBe('45 分前に更新');
    expect(relativeUpdated('2026-08-20T12:00:00Z', NOW, 'ja')).toBe('3 日前に更新');
    expect(relativeUpdated('2026-01-01T00:00:00Z', NOW, 'ja')).toBe('2026-01-01 に更新');

    expect(relativeUpdated('2026-08-23T11:59:30Z', NOW, 'fr')).toBe('Mis à jour à l’instant');
    expect(relativeUpdated('2026-08-23T11:15:00Z', NOW, 'fr')).toBe('Mis à jour il y a 45 minutes');
    expect(relativeUpdated('2026-08-22T12:00:00Z', NOW, 'fr')).toBe('Mis à jour il y a 1 jour');
    expect(relativeUpdated('2026-01-01T00:00:00Z', NOW, 'fr')).toBe('Mis à jour le 2026-01-01');
  });

  it('非法/缺失输入返回空串（调用方不渲染）', () => {
    expect(relativeUpdated(undefined, NOW, 'en')).toBe('');
    expect(relativeUpdated('not-a-date', NOW, 'en')).toBe('');
  });
});

describe('heatTooltip（格子提示双语）', () => {
  it('英文：N contributions on YYYY-MM-DD（0/1 特判）', () => {
    expect(heatTooltip('2026-08-22', 0, 'en')).toBe('No contributions on 2026-08-22');
    expect(heatTooltip('2026-08-22', 1, 'en')).toBe('1 contribution on 2026-08-22');
    expect(heatTooltip('2026-08-22', 5, 'en')).toBe('5 contributions on 2026-08-22');
  });

  it('中文：YYYY年M月D日，N 次贡献（0 → 无贡献）', () => {
    expect(heatTooltip('2026-08-22', 0, 'zh')).toBe('2026年8月22日，无贡献');
    expect(heatTooltip('2026-08-22', 5, 'zh')).toBe('2026年8月22日，5 次贡献');
    expect(heatTooltip('2026-01-03', 12, 'zh')).toBe('2026年1月3日，12 次贡献');
  });

  it('日/法语：本地化文案（0 与复数特判）', () => {
    expect(heatTooltip('2026-08-22', 0, 'ja')).toBe('2026年8月22日、コントリビューションなし');
    expect(heatTooltip('2026-08-22', 5, 'ja')).toBe('2026年8月22日、5 件のコントリビューション');
    expect(heatTooltip('2026-08-22', 0, 'fr')).toBe('Aucune contribution le 2026-08-22');
    expect(heatTooltip('2026-08-22', 1, 'fr')).toBe('1 contribution le 2026-08-22');
    expect(heatTooltip('2026-08-22', 5, 'fr')).toBe('5 contributions le 2026-08-22');
  });
});

describe('monthLabels / weekdayLabels（坐标轴）', () => {
  const heatWeek = (dates: (string | null)[]): HeatWeek => ({
    days: dates.map((d) => (d === null ? null : { date: d, count: 0, level: 0 })),
  });

  it('只标新月起始列（含 1 日的周列），首列兜底标首月', () => {
    const weeks = [
      heatWeek(['2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03']),
      heatWeek(['2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10']),
      heatWeek(['2026-01-25', '2026-01-26', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31']),
      heatWeek(['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06', '2026-02-07']),
    ];
    expect(monthLabels(weeks, 'en')).toEqual([
      { weekIndex: 0, label: 'Jan' },
      { weekIndex: 3, label: 'Feb' },
    ]);
    expect(monthLabels(weeks, 'zh')).toEqual([
      { weekIndex: 0, label: '1月' },
      { weekIndex: 3, label: '2月' },
    ]);
    expect(monthLabels(weeks, 'ja')).toEqual([
      { weekIndex: 0, label: '1月' },
      { weekIndex: 3, label: '2月' },
    ]);
    expect(monthLabels(weeks, 'fr')).toEqual([
      { weekIndex: 0, label: 'janv.' },
      { weekIndex: 3, label: 'févr.' },
    ]);
  });

  it('首周不含 1 日时按首天月份标注', () => {
    const weeks = [
      heatWeek([null, null, '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']),
      heatWeek(['2026-08-30', '2026-08-31', '2026-09-01', null, null, null, null]),
    ];
    expect(monthLabels(weeks, 'en')).toEqual([
      { weekIndex: 0, label: 'Aug' },
      { weekIndex: 1, label: 'Sep' },
    ]);
  });

  it('星期标签：GitHub 只显示 Mon/Wed/Fri（中文一/三/五）', () => {
    expect(weekdayLabels('en')).toEqual([null, 'Mon', null, 'Wed', null, 'Fri', null]);
    expect(weekdayLabels('zh')).toEqual([null, '一', null, '三', null, '五', null]);
    expect(weekdayLabels('ja')).toEqual([null, '月', null, '水', null, '金', null]);
    expect(weekdayLabels('fr')).toEqual([null, 'lun.', null, 'mer.', null, 'ven.', null]);
  });
});

describe('tooltipLeft（tooltip 水平定位不溢出容器）', () => {
  it('居中对齐，clamp 在容器左右界内', () => {
    // 居中不溢出
    expect(tooltipLeft(100, 40, 0, 200)).toBe(80);
    // 左侧溢出 → 贴容器左缘
    expect(tooltipLeft(10, 40, 0, 200)).toBe(0);
    // 右侧溢出 → 贴容器右缘
    expect(tooltipLeft(195, 40, 0, 200)).toBe(160);
    // tooltip 比容器还宽 → 贴左缘
    expect(tooltipLeft(100, 300, 0, 200)).toBe(0);
  });
});

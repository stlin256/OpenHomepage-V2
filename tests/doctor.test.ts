/**
 * doctor 自检逻辑测试（docs/specs/16-doctor.md）。
 * 数据类检查全部在临时目录构造 fixture；端口与网络检查注入替身，不触碰真实环境。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  parseVersion,
  checkNodeVersion,
  checkDataDir,
  extractAssetRefsFromMarkdown,
  extractAssetRefsFromYaml,
  checkAssetRefs,
  checkDirectiveBalance,
  checkDirectives,
  checkLanguages,
  checkPorts,
  checkGithubApi,
  checkGithubTokenEnv,
  GITHUB_TOKEN_GUIDE_URL,
  checkRssSources,
  runDoctor,
  summarize,
  type FetchLike,
  type DoctorReport,
} from '../scripts/doctor-lib.ts';

/** 在临时目录中写入文件树，回调拿到根目录，结束后清理 */
function withTempRoot(files: Record<string, string>, fn: (root: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), 'oh-doctor-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, ...rel.split('/'));
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** 最小健康数据目录（site.yaml + 双语页面 + 素材） */
function healthyFiles(): Record<string, string> {
  return {
    'data/site.yaml': [
      'site:',
      '  title: "测试站"',
      '  language: zh-CN',
      'profile:',
      '  name: "张三"',
      'github:',
      '  username: "someone"',
      '',
    ].join('\n'),
    'data/pages/zh/index.md': '---\ntitle: 主页\n---\n正文 ![](assets/avatar.png)\n',
    'data/pages/en/index.md': '---\ntitle: Home\n---\n',
    'data/assets/avatar.png': 'fake-png',
  };
}

function severityOf(report: DoctorReport, sectionId: string): string[] {
  return report.sections.find((s) => s.id === sectionId)!.items.map((i) => i.severity);
}

const freeProbe = async () => 'free' as const;

describe('parseVersion / checkNodeVersion', () => {
  it('解析常见版本号', () => {
    expect(parseVersion('v18.17.0')).toEqual([18, 17, 0]);
    expect(parseVersion('22.5.1')).toEqual([22, 5, 1]);
    expect(parseVersion('not-a-version')).toBeNull();
  });

  it('≥ 18.17.0 通过，更低版本致命', () => {
    expect(checkNodeVersion('v18.17.0').severity).toBe('ok');
    expect(checkNodeVersion('v20.0.0').severity).toBe('ok');
    expect(checkNodeVersion('v18.16.9').severity).toBe('error');
    expect(checkNodeVersion('v16.20.0').severity).toBe('error');
  });
});

describe('checkDataDir', () => {
  it('data/ 存在 → ok；仅 data.example → warn 回退；都缺 → error', () => {
    withTempRoot({ 'data/site.yaml': '' }, (root) => {
      const r = checkDataDir(root);
      expect(r.item.severity).toBe('ok');
      expect(r.dataDir).toBe(path.join(root, 'data'));
      expect(r.usedExample).toBe(false);
    });
    withTempRoot({ 'data.example/site.yaml': '' }, (root) => {
      const r = checkDataDir(root);
      expect(r.item.severity).toBe('warn');
      expect(r.dataDir).toBe(path.join(root, 'data.example'));
      expect(r.usedExample).toBe(true);
    });
    withTempRoot({}, (root) => {
      const r = checkDataDir(root);
      expect(r.item.severity).toBe('error');
      expect(r.dataDir).toBeNull();
    });
  });
});

describe('extractAssetRefsFromMarkdown', () => {
  it('提取 markdown 图片与指令/HTML 属性引用，带行号', () => {
    const md = [
      '---',
      'title: t',
      'og_image: assets/og.png', // frontmatter 内引用保留
      '---',
      '![头像](assets/avatar.png)',
      '',
      ':::figure{src="assets/photo.jpg" caption="图"}',
      ':::',
      '<video src="assets/demo.mp4"></video>',
    ].join('\n');
    const refs = extractAssetRefsFromMarkdown(md);
    expect(refs).toContainEqual({ line: 3, ref: 'assets/og.png' });
    expect(refs).toContainEqual({ line: 5, ref: 'assets/avatar.png' });
    expect(refs).toContainEqual({ line: 7, ref: 'assets/photo.jpg' });
    expect(refs).toContainEqual({ line: 9, ref: 'assets/demo.mp4' });
  });

  it('fenced code block 内的引用不计入', () => {
    const md = ['```md', '![x](assets/fake.png)', '```', '![y](assets/real.png)'].join('\n');
    const refs = extractAssetRefsFromMarkdown(md);
    expect(refs).toEqual([{ line: 4, ref: 'assets/real.png' }]);
  });

  it('归一化 ./ 前缀与 query/hash，忽略非 assets 路径', () => {
    const md = '![a](./assets/a.png?v=2) ![b](https://example.com/x.png) ![c](/img/c.png)';
    expect(extractAssetRefsFromMarkdown(md)).toEqual([{ line: 1, ref: 'assets/a.png' }]);
  });
});

describe('extractAssetRefsFromYaml', () => {
  it('提取值位引用，忽略注释行与无扩展名散文', () => {
    const yaml = [
      '# 头像放在 assets/ 目录下',
      'profile:',
      '  avatar: "assets/avatar.png"',
      '  # favicon: assets/favicon.svg',
      'bgm:',
      '  file: assets/bgm.mp3 # 背景音乐',
      'note: 把文件放到 assets/ 目录即可',
    ].join('\n');
    const refs = extractAssetRefsFromYaml(yaml);
    expect(refs).toContainEqual({ line: 3, ref: 'assets/avatar.png' });
    expect(refs).toContainEqual({ line: 6, ref: 'assets/bgm.mp3' });
    expect(refs).toHaveLength(2);
  });
});

describe('checkAssetRefs', () => {
  it('失效引用按 文件:行号 报 error，存在的引用通过', () => {
    withTempRoot(healthyFiles(), (root) => {
      // 引用存在 → 全部 ok
      let items = checkAssetRefs(path.join(root, 'data'));
      expect(items.every((i) => i.severity === 'ok')).toBe(true);

      // 增加一个失效引用
      writeFileSync(
        path.join(root, 'data', 'pages', 'zh', 'about.md'),
        '---\ntitle: 关于\n---\n![缺失](assets/missing.jpg)\n'
      );
      items = checkAssetRefs(path.join(root, 'data'));
      const bad = items.filter((i) => i.severity === 'error');
      expect(bad).toHaveLength(1);
      expect(bad[0].message).toContain(path.join('pages', 'zh', 'about.md') + ':4');
      expect(bad[0].message).toContain('assets/missing.jpg');
      expect(bad[0].suggestion).toBeTruthy();
    });
  });

  it('assets/remote/ 引用跳过（构建期本地化产物）', () => {
    withTempRoot(
      { 'data/pages/zh/index.md': '---\ntitle: t\n---\n![](assets/remote/abc.jpg)\n' },
      (root) => {
        const items = checkAssetRefs(path.join(root, 'data'));
        expect(items.every((i) => i.severity === 'ok')).toBe(true);
      }
    );
  });
});

describe('checkDirectiveBalance', () => {
  it('正确嵌套（::::grid 包 :::cell）通过', () => {
    const md = [
      '::::grid{cols=2}',
      ':::cell',
      '左栏',
      ':::',
      ':::cell',
      '右栏',
      ':::',
      '::::',
    ].join('\n');
    expect(checkDirectiveBalance(md)).toEqual([]);
  });

  it('未闭合容器报错', () => {
    const md = ':::note\n内容没闭合\n';
    const issues = checkDirectiveBalance(md);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(1);
    expect(issues[0].message).toContain('未闭合');
  });

  it('多余的闭合围栏报错', () => {
    const issues = checkDirectiveBalance('正文\n:::\n');
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(2);
    expect(issues[0].message).toContain('多余的闭合围栏');
  });

  it('闭合冒号数不足报错（误嵌套场景）', () => {
    const md = ['::::grid', ':::cell', 'x', ':::', ':::'].join('\n');
    const issues = checkDirectiveBalance(md);
    expect(issues.some((i) => i.message.includes('闭合冒号数需 ≥ 开启数'))).toBe(true);
  });

  it('fenced code block 与 frontmatter 内的 ::: 不计', () => {
    const md = ['---', 'title: t', '---', '```md', ':::note', ':::', '```', '正文'].join('\n');
    expect(checkDirectiveBalance(md)).toEqual([]);
  });

  it('::stream 叶子指令不参与配平', () => {
    expect(checkDirectiveBalance('::stream{id="welcome"}\n')).toEqual([]);
  });
});

describe('checkDirectives / checkLanguages（数据目录级）', () => {
  it('页面指令不配平 → error；主语言缺目录 → error；健康数据全通过', () => {
    withTempRoot(healthyFiles(), (root) => {
      const dataDir = path.join(root, 'data');
      expect(checkDirectives(dataDir).every((i) => i.severity === 'ok')).toBe(true);
      const langs = checkLanguages(dataDir, {
        site: { title: 't', language: 'zh-CN' },
        profile: { name: 'n' },
        github: { username: 'u' },
      });
      expect(langs.every((i) => i.severity === 'ok')).toBe(true);

      // 指令不配平
      writeFileSync(path.join(dataDir, 'pages', 'zh', 'bad.md'), '---\ntitle: b\n---\n:::note\n');
      expect(checkDirectives(dataDir).some((i) => i.severity === 'error')).toBe(true);

      // 主语言缺目录
      const bad = checkLanguages(dataDir, {
        site: { title: 't', language: 'fr-FR' },
        profile: { name: 'n' },
        github: { username: 'u' },
      });
      expect(bad.some((i) => i.severity === 'error' && i.message.includes('"fr"'))).toBe(true);
    });
  });

  it('语言目录为空 → warn；pages/ 缺失 → error', () => {
    withTempRoot(healthyFiles(), (root) => {
      mkdirSync(path.join(root, 'data', 'pages', 'ja'), { recursive: true });
      const items = checkLanguages(path.join(root, 'data'), null);
      expect(items.some((i) => i.severity === 'warn' && i.message.includes('pages/ja/'))).toBe(true);
    });
    withTempRoot({ 'data/site.yaml': '' }, (root) => {
      const items = checkLanguages(path.join(root, 'data'), null);
      expect(items[0].severity).toBe('error');
      expect(items[0].message).toContain('pages/');
    });
  });
});

describe('checkPorts', () => {
  it('空闲 → ok；占用 → warn', async () => {
    const items = await checkPorts(
      [
        { port: 4321, label: 'Astro dev' },
        { port: 4174, label: 'admin 后台' },
      ],
      async (port) => (port === 4321 ? 'busy' : 'free')
    );
    expect(items[0].severity).toBe('warn');
    expect(items[0].message).toContain('4321');
    expect(items[1].severity).toBe('ok');
  });
});

describe('外部接口（注入 fetch 替身）', () => {
  const fakeFetch = (status: number, headers: Record<string, string> = {}): FetchLike =>
    (async () => ({ status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } })) as FetchLike;
  const failingFetch: FetchLike = async () => {
    throw new Error('network down');
  };

  it('GitHub API：200 → ok（附额度）；403 且额度 0 → warn；异常 → warn', async () => {
    expect((await checkGithubApi(fakeFetch(200, { 'x-ratelimit-remaining': '59' }))).severity).toBe('ok');
    const limited = await checkGithubApi(fakeFetch(403, { 'x-ratelimit-remaining': '0' }));
    expect(limited.severity).toBe('warn');
    expect(limited.message).toContain('rate limit');
    expect((await checkGithubApi(failingFetch)).severity).toBe('warn');
  });

  it('GitHub 检查限流 / 401 的建议附 token 生成页 deep link 与 read:user scope（spec 22 §4）', async () => {
    const limited = await checkGithubApi(fakeFetch(403, { 'x-ratelimit-remaining': '0' }));
    expect(limited.suggestion).toContain(GITHUB_TOKEN_GUIDE_URL);
    expect(limited.suggestion).toContain('read:user');
    const unauthorized = await checkGithubApi(fakeFetch(401));
    expect(unauthorized.severity).toBe('warn');
    expect(unauthorized.message).toContain('401');
    expect(unauthorized.suggestion).toContain(GITHUB_TOKEN_GUIDE_URL);
    expect(unauthorized.suggestion).toContain('read:user');
  });

  it('Token 环境变量检查：GH_PAT/GITHUB_TOKEN/GH_TOKEN 任一存在 → ok；全缺 → warn 附引导链接', () => {
    for (const key of ['GH_PAT', 'GITHUB_TOKEN', 'GH_TOKEN']) {
      expect(checkGithubTokenEnv({ [key]: 'x' }).severity).toBe('ok');
    }
    const missing = checkGithubTokenEnv({});
    expect(missing.severity).toBe('warn');
    expect(missing.suggestion).toContain(GITHUB_TOKEN_GUIDE_URL);
    expect(missing.suggestion).toContain('read:user');
    // 空字符串视为未配置
    expect(checkGithubTokenEnv({ GH_PAT: '' }).severity).toBe('warn');
  });

  it('RSS 源：2xx/3xx → ok；其余 → warn', async () => {
    const sources = [
      { name: 'A', url: 'https://a.example/feed' },
      { name: 'B', url: 'https://b.example/rss' },
    ];
    const fetchFn: FetchLike = async (url) => {
      if (String(url).includes('a.example')) return { status: 200, headers: { get: () => null } };
      throw new Error('timeout');
    };
    const items = await checkRssSources(sources, fetchFn);
    expect(items[0].severity).toBe('ok');
    expect(items[1].severity).toBe('warn');
    expect(items[1].message).toContain('B');
  });
});

describe('runDoctor 编排', () => {
  it('健康数据全通过，默认离线跳过网络检查，退出统计无错误', async () => {
    await withTempRootAsync(healthyFiles(), async (root) => {
      const report = await runDoctor({ rootDir: root, probePortFn: freeProbe, nodeVersion: 'v20.0.0' });
      const counts = summarize(report);
      expect(counts.error).toBe(0);
      expect(counts.ok).toBeGreaterThan(0);
      // 离线：外部接口节为 skip
      expect(severityOf(report, 'online')).toEqual(['skip']);
      expect(report.usedExample).toBe(false);
    });
  });

  it('素材失效 + 指令不配平 + 主语言缺失 → 多个 error', async () => {
    const files = healthyFiles();
    files['data/site.yaml'] = files['data/site.yaml'].replace('zh-CN', 'fr-FR');
    files['data/pages/zh/index.md'] = '---\ntitle: 主页\n---\n![](assets/gone.png)\n:::note\n';
    await withTempRootAsync(files, async (root) => {
      const report = await runDoctor({ rootDir: root, probePortFn: freeProbe, nodeVersion: 'v20.0.0' });
      const counts = summarize(report);
      expect(counts.error).toBeGreaterThanOrEqual(3);
      expect(severityOf(report, 'assets')).toContain('error');
      expect(severityOf(report, 'directives')).toContain('error');
      expect(severityOf(report, 'langs')).toContain('error');
    });
  });

  it('data/ 与 data.example/ 都缺失 → 致命且后续节跳过', async () => {
    await withTempRootAsync({}, async (root) => {
      const report = await runDoctor({ rootDir: root, probePortFn: freeProbe, nodeVersion: 'v20.0.0' });
      expect(report.dataDir).toBeNull();
      expect(summarize(report).error).toBeGreaterThanOrEqual(1);
      expect(severityOf(report, 'assets')).toEqual(['skip']);
    });
  });

  it('data/ 缺失时回退 data.example/ 并警告', async () => {
    const files = healthyFiles();
    const renamed: Record<string, string> = {};
    for (const [k, v] of Object.entries(files)) renamed[k.replace(/^data\//, 'data.example/')] = v;
    await withTempRootAsync(renamed, async (root) => {
      const report = await runDoctor({ rootDir: root, probePortFn: freeProbe, nodeVersion: 'v20.0.0' });
      expect(report.usedExample).toBe(true);
      expect(severityOf(report, 'data-dir')).toEqual(['warn']);
      expect(summarize(report).error).toBe(0);
    });
  });

  it('--online 时执行网络检查（注入替身）', async () => {
    await withTempRootAsync(healthyFiles(), async (root) => {
      const fetchFn: FetchLike = async () => ({ status: 200, headers: { get: () => null } });
      const report = await runDoctor({
        rootDir: root,
        online: true,
        fetchFn,
        probePortFn: freeProbe,
        nodeVersion: 'v20.0.0',
        env: { GH_PAT: 'test-token' },
      });
      const items = report.sections.find((s) => s.id === 'online')!.items;
      expect(items.length).toBeGreaterThan(0);
      // Token 配置检查 + GitHub API 探测通过；fixture 未启用 RSS，源探测为 skip
      expect(items[0].severity).toBe('ok');
      expect(items.every((i) => i.severity === 'ok' || i.severity === 'skip')).toBe(true);
    });
  });

  it('--online 且未配置 token → 外部接口节首项为带引导链接的 warn（spec 22 §4）', async () => {
    await withTempRootAsync(healthyFiles(), async (root) => {
      const fetchFn: FetchLike = async () => ({ status: 200, headers: { get: () => null } });
      const report = await runDoctor({
        rootDir: root,
        online: true,
        fetchFn,
        probePortFn: freeProbe,
        nodeVersion: 'v20.0.0',
        env: {},
      });
      const items = report.sections.find((s) => s.id === 'online')!.items;
      expect(items[0].severity).toBe('warn');
      expect(items[0].suggestion).toContain(GITHUB_TOKEN_GUIDE_URL);
    });
  });

  it('site.yaml YAML 语法错误 → 配置节 error', async () => {
    const files = healthyFiles();
    files['data/site.yaml'] = 'site:\n  title: "未闭合\n  : [';
    await withTempRootAsync(files, async (root) => {
      const report = await runDoctor({ rootDir: root, probePortFn: freeProbe, nodeVersion: 'v20.0.0' });
      expect(severityOf(report, 'config')).toContain('error');
    });
  });
});

/** async 版 withTempRoot */
async function withTempRootAsync(files: Record<string, string>, fn: (root: string) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), 'oh-doctor-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(root, ...rel.split('/'));
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

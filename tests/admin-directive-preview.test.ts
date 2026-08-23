/**
 * 指令卡片预览数据（admin/server/directive-preview.ts）与 markdown 摘要
 * （admin/shared/markdown-excerpt.ts）单测：临时目录构造 .cache 与 data/，不发请求。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readDirectivePreview } from '../admin/server/directive-preview.ts';
import { markdownExcerpt } from '../admin/shared/markdown-excerpt.ts';

let dir: string;
let rootDir: string;
let dataDir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'oh-dp-'));
  rootDir = dir;
  dataDir = path.join(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const SITE = `
site: { title: T }
profile: { name: N }
github: { username: octocat }
streaming_blocks:
  - id: welcome
    title: { zh: "致辞", en: "Greeting" }
    content_file: "streaming/welcome.md"
  - id: missing
    content_file: "streaming/nope.md"
`;

describe('readDirectivePreview', () => {
  it('pinned 从 .cache/github.json 读取（白名单字段），stream 带标题与内容摘要', () => {
    mkdirSync(path.join(rootDir, '.cache'), { recursive: true });
    writeFileSync(
      path.join(rootDir, '.cache', 'github.json'),
      JSON.stringify({
        pinned: {
          data: [
            {
              full_name: 'octocat/hello',
              description: 'desc',
              note: '备注',
              language: 'Go',
              stargazers_count: 7,
              forks_count: 1,
              html_url: 'https://github.com/octocat/hello',
              topics: ['go', 'cli'],
              updated_at: '2026-08-20T00:00:00Z',
              node_id: 'drop-me',
            },
          ],
        },
      })
    );
    writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
    mkdirSync(path.join(dataDir, 'streaming', 'zh'), { recursive: true });
    writeFileSync(path.join(dataDir, 'streaming', 'zh', 'welcome.md'), '# 标题\n\n你好，**世界**。');

    const preview = readDirectivePreview(rootDir, dataDir);
    expect(preview.pinned).toEqual([
      {
        full_name: 'octocat/hello',
        description: 'desc',
        note: '备注',
        language: 'Go',
        stargazers_count: 7,
        forks_count: 1,
        html_url: 'https://github.com/octocat/hello',
        topics: ['go', 'cli'],
        updated_at: '2026-08-20T00:00:00Z',
      },
    ]);
    expect(preview.streams).toEqual([
      { id: 'welcome', title: '致辞', excerpt: '标题 你好，世界。' },
      { id: 'missing', title: '', excerpt: '' },
    ]);
  });

  it('.cache 或 site.yaml 缺失/损坏时对应部分降级为空，不抛错', () => {
    writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
    expect(readDirectivePreview(rootDir, dataDir).pinned).toEqual([]);

    mkdirSync(path.join(rootDir, '.cache'), { recursive: true });
    writeFileSync(path.join(rootDir, '.cache', 'github.json'), 'not json');
    const preview = readDirectivePreview(rootDir, dataDir);
    expect(preview.pinned).toEqual([]);
    expect(preview.streams).toHaveLength(2);
  });

  it('流式内容按语言目录回退（zh 缺失时读 en，再退原路径）', () => {
    writeFileSync(path.join(dataDir, 'site.yaml'), SITE);
    mkdirSync(path.join(dataDir, 'streaming', 'en'), { recursive: true });
    writeFileSync(path.join(dataDir, 'streaming', 'en', 'welcome.md'), 'hello en');
    const preview = readDirectivePreview(rootDir, dataDir);
    expect(preview.streams[0].excerpt).toBe('hello en');
  });
});

describe('markdownExcerpt', () => {
  it('剥离 frontmatter/代码围栏/指令行/图片/链接/强调/HTML，压缩空白', () => {
    const md = [
      '---',
      'title: x',
      '---',
      '# 大标题',
      '',
      '正文 **加粗** 与 [链接](https://a.com) 与 ![图](assets/a.jpg)。',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      ':::figure{src="assets/a.jpg"}',
      ':::',
      '',
      '> 引用一句',
      '<div>html 文本</div>',
    ].join('\n');
    expect(markdownExcerpt(md)).toBe('大标题 正文 加粗 与 链接 与 图。 引用一句 html 文本');
  });

  it('按码点截断并追加省略号', () => {
    const md = '汉'.repeat(200);
    const out = markdownExcerpt(md, 120);
    expect([...out]).toHaveLength(121); // 120 字 + …
    expect(out.endsWith('…')).toBe(true);
    expect(markdownExcerpt('短', 120)).toBe('短');
  });
});

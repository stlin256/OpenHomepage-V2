/**
 * 指令元数据与插入片段（admin/shared/directives.ts）+ 源码块坐标层
 * （src/lib/edit-blocks.ts）的解析往返测试（M12e：旧 Milkdown 全文编辑器移除后，
 * 指令往返的正确性由「渲染管线同源解析器 + 块坐标切片 + serializeAttrs」保证，
 * 本文件承接原 tests/admin-directives.test.ts 的覆盖意图）。
 */
import { describe, it, expect } from 'vitest';
import { DIRECTIVE_DEFS, INSERT_SNIPPETS, DIRECTIVE_LABEL_KEYS } from '../admin/shared/directives.ts';
import { listEditableBlocks, parseBody, serializeAttrs } from '../src/lib/edit-blocks.ts';

/** 解析单个块并返回 [name, attrs]（仅指令块有这两个字段） */
function parseOne(md: string) {
  const blocks = listEditableBlocks(md);
  expect(blocks).toHaveLength(1);
  return blocks[0];
}

describe('叶指令往返（::name{attrs}）', () => {
  it('bilibili / youtube / stream / ghcard / editorial 的名称与属性表原样保留', () => {
    const cases: [string, string, Record<string, string>][] = [
      ['::bilibili{bvid="BV1xx411c7mD"}\n', 'bilibili', { bvid: 'BV1xx411c7mD' }],
      ['::youtube{id="dQw4w9WgXcQ"}\n', 'youtube', { id: 'dQw4w9WgXcQ' }],
      ['::stream{id="welcome"}\n', 'stream', { id: 'welcome' }],
      ['::ghcard{repo="owner/repo"}\n', 'ghcard', { repo: 'owner/repo' }],
      ['::editorial{id="features"}\n', 'editorial', { id: 'features' }],
    ];
    for (const [md, name, attrs] of cases) {
      const block = parseOne(md);
      expect(block.kind).toBe('leafDirective');
      expect(block.name).toBe(name);
      expect(block.attrs).toEqual(attrs);
      // 坐标切片即原文（无损）
      expect(md.slice(block.start, block.end)).toBe(md.trimEnd());
      // 属性表经 serializeAttrs 重新序列化后解析等价
      const re = parseBody(`::${name}${serializeAttrs(attrs)}\n`).children[0] as {
        attributes?: Record<string, string>;
      };
      expect(re.attributes ?? {}).toEqual(attrs);
    }
  });
});

describe('空容器指令往返（video/audio/figure）', () => {
  it('video 保留 src 与 poster', () => {
    const md = ':::video{src="assets/demo.mp4" poster="assets/cover.png"}\n:::\n';
    const block = parseOne(md);
    expect(block.kind).toBe('containerDirective');
    expect(block.name).toBe('video');
    expect(block.attrs).toEqual({ src: 'assets/demo.mp4', poster: 'assets/cover.png' });
  });

  it('audio / figure 保留参数（含 align 对齐）', () => {
    expect(parseOne(':::audio{src="assets/podcast.mp3"}\n:::\n').attrs).toEqual({
      src: 'assets/podcast.mp3',
    });
    const fig = parseOne(':::figure{src="assets/photo.jpg" caption="图 1" width="72%" align="center"}\n:::\n');
    expect(fig.attrs).toEqual({
      src: 'assets/photo.jpg',
      caption: '图 1',
      width: '72%',
      align: 'center',
    });
  });
});

describe('grid 嵌套容器往返', () => {
  it('grid > cell × 2，单元格内容块递归枚举且切片即原文', () => {
    const md = [
      '::::grid{cols=2}',
      ':::cell',
      '左栏 **加粗**',
      ':::',
      ':::cell',
      '右栏',
      ':::',
      '::::',
      '',
    ].join('\n');
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => `${b.kind}:${b.name ?? b.kind}`)).toEqual([
      'containerDirective:grid',
      'containerDirective:cell',
      'paragraph:paragraph',
      'containerDirective:cell',
      'paragraph:paragraph',
    ]);
    expect(blocks[0].attrs).toEqual({ cols: '2' });
    expect(md.slice(blocks[2].start, blocks[2].end)).toBe('左栏 **加粗**');
    expect(md.slice(blocks[4].start, blocks[4].end)).toBe('右栏');
  });
});

describe('与普通 markdown 混排', () => {
  it('标题/列表/公式/指令共存，各自枚举为独立块', () => {
    const md = '# 标题\n\n- 项目\n\n::stream{id="welcome"}\n\n$$\na+b\n$$\n';
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'list',
      'leafDirective',
      'math',
    ]);
    expect(md.slice(blocks[2].start, blocks[2].end)).toBe('::stream{id="welcome"}');
  });
});

describe('未识别指令降级', () => {
  it('正文中的 "16:9" 被 remark-directive 视为 textDirective，块切片保留原文', () => {
    const md = '播放器以响应式 16:9 容器渲染。\n';
    const block = parseOne(md);
    expect(block.kind).toBe('paragraph');
    expect(md.slice(block.start, block.end)).toContain('16:9 容器');
  });

  it('未识别的叶/容器指令按原文保留（坐标切片无损）', () => {
    const leaf = '::unknown{a="1"}\n';
    const b1 = parseOne(leaf);
    expect(b1.name).toBe('unknown');
    expect(leaf.slice(b1.start, b1.end)).toBe('::unknown{a="1"}');

    const container = ':::unknown{a="1"}\n内容\n:::\n';
    const blocks = listEditableBlocks(container);
    expect(blocks[0].name).toBe('unknown');
    expect(container.slice(blocks[0].start, blocks[0].end)).toContain(':::unknown{a="1"}');
    expect(container.slice(blocks[0].start, blocks[0].end)).toContain('内容');
  });
});

describe('INSERT_SNIPPETS 与元数据一致', () => {
  it('每个 DIRECTIVE_DEFS 都有插入片段，片段解析出的指令名/类型与元数据一致', () => {
    for (const def of DIRECTIVE_DEFS) {
      const snippet = INSERT_SNIPPETS[def.id];
      expect(snippet, `缺少 ${def.id} 的插入片段`).toBeTruthy();
      const block = parseOne(snippet);
      expect(block.name).toBe(def.name);
      expect(block.kind).toBe(def.kind === 'leaf' ? 'leafDirective' : 'containerDirective');
      // 片段的占位属性都在元数据 params 内
      for (const key of Object.keys(block.attrs ?? {})) {
        expect(def.params.map((p) => p.key)).toContain(key);
      }
    }
  });

  it('grid 片段单独提供（不在 DIRECTIVE_DEFS），解析为 grid > cell × 2', () => {
    const blocks = listEditableBlocks(INSERT_SNIPPETS.grid);
    expect(blocks[0].name).toBe('grid');
    expect(blocks.filter((b) => b.name === 'cell')).toHaveLength(2);
  });

  it('DIRECTIVE_LABEL_KEYS 覆盖全部指令展示名（含 grid）', () => {
    for (const def of DIRECTIVE_DEFS) {
      expect(DIRECTIVE_LABEL_KEYS[def.id]).toBeTruthy();
    }
    expect(DIRECTIVE_LABEL_KEYS.grid).toBeTruthy();
  });
});

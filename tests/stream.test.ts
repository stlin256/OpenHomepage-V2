import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Element, ElementContent } from 'hast';
import {
  splitTextTokens,
  hastToStreamTokens,
  serializeTokensJson,
  resolveStreamingFile,
  loadStreamingBlock,
  markdownToStream,
  streamEmbedHtml,
  DEFAULT_STREAM_SPEED,
  type StreamToken,
} from '../src/lib/stream.ts';

function text(value: string): ElementContent {
  return { type: 'text', value };
}
function el(tagName: string, children: ElementContent[] = [], properties = {}): Element {
  return { type: 'element', tagName, properties, children };
}

describe('splitTextTokens', () => {
  it('CJK 逐字切分', () => {
    expect(splitTextTokens('你好世界')).toEqual(['你', '好', '世', '界']);
  });

  it('拉丁字母/数字按词切分并连尾部空格', () => {
    expect(splitTextTokens('hello world')).toEqual(['hello ', 'world']);
    expect(splitTextTokens('v2.0 API')).toEqual(['v2', '.', '0 ', 'API']);
  });

  it('标点独立成 token（供前端停顿判定）', () => {
    expect(splitTextTokens('你好，世界！')).toEqual(['你', '好', '，', '世', '界', '！']);
    expect(splitTextTokens('ok, done.')).toEqual(['ok', ',', ' ', 'done', '.']);
  });

  it('空白串为单独 token；空串返回空数组', () => {
    expect(splitTextTokens('a  b\nc')).toEqual(['a  ', 'b', '\n', 'c']);
    expect(splitTextTokens('')).toEqual([]);
  });

  it('全角标点与假名单字切分', () => {
    expect(splitTextTokens('こんにちは。')).toEqual(['こ', 'ん', 'に', 'ち', 'は', '。']);
  });
});

describe('hastToStreamTokens', () => {
  it('段落：open → 文本 token → close', () => {
    const tokens = hastToStreamTokens([el('p', [text('你好')])]);
    expect(tokens).toEqual([
      { t: 'open', tag: 'p', h: '<p>' },
      { t: 'text', w: '你' },
      { t: 'text', w: '好' },
      { t: 'close' },
    ]);
  });

  it('开标签保留 class/style 等属性', () => {
    const tokens = hastToStreamTokens([
      el('h2', [text('标题')], { className: ['a', 'b'], id: 'x' }),
    ]);
    expect(tokens[0]).toEqual({ t: 'open', tag: 'h2', h: '<h2 class="a b" id="x">' });
    expect(tokens.at(-1)).toEqual({ t: 'close' });
  });

  it('链接整体作为一个 node token（避免半截语法闪烁）', () => {
    const tokens = hastToStreamTokens([
      el('p', [text('见 '), el('a', [text('链接')], { href: 'https://a.b' })]),
    ]);
    expect(tokens).toEqual([
      { t: 'open', tag: 'p', h: '<p>' },
      { t: 'text', w: '见' },
      { t: 'text', w: ' ' },
      { t: 'node', h: '<a href="https://a.b">链接</a>' },
      { t: 'close' },
    ]);
  });

  it('图片/水平线为原子 node token', () => {
    const tokens = hastToStreamTokens([
      el('p', [el('img', [], { src: 'a.png', alt: '图' })]),
      el('hr'),
    ]);
    expect(tokens[1]).toEqual({ t: 'node', h: '<img src="a.png" alt="图">' });
    expect(tokens[3]).toEqual({ t: 'node', h: '<hr>' });
  });

  it('Shiki 代码块按 .line 逐行流出，行间换行为空白 text token', () => {
    const pre = el('pre', [
      el('code', [
        el('span', [text('const a = 1;')], { className: ['line'] }),
        text('\n'),
        el('span', [text('const b = 2;')], { className: ['line'] }),
      ]),
    ], { className: ['shiki'] });
    const tokens = hastToStreamTokens([pre]);
    expect(tokens).toEqual([
      { t: 'open', tag: 'pre', h: '<pre class="shiki">' },
      { t: 'open', tag: 'code', h: '<code>' },
      { t: 'node', h: '<span class="line">const a = 1;</span>' },
      { t: 'text', w: '\n' },
      { t: 'node', h: '<span class="line">const b = 2;</span>' },
      { t: 'close' },
      { t: 'close' },
    ]);
  });

  it('无 .line 的 pre 整块一次性出现', () => {
    const pre = el('pre', [text('plain code')]);
    expect(hastToStreamTokens([pre])).toEqual([
      { t: 'node', h: '<pre>plain code</pre>' },
    ]);
  });

  it('嵌套结构 open/close 配对', () => {
    const tokens = hastToStreamTokens([
      el('ul', [el('li', [el('strong', [text('要点')])])]),
    ]);
    expect(tokens.map((t) => t.t)).toEqual([
      'open', 'open', 'open', 'text', 'text', 'close', 'close', 'close',
    ]);
    const opens = tokens.filter((t) => t.t === 'open') as Extract<StreamToken, { t: 'open' }>[];
    expect(opens.map((t) => t.tag)).toEqual(['ul', 'li', 'strong']);
  });
});

describe('serializeTokensJson', () => {
  it('转义 </ 防止 script 提前终止', () => {
    const json = serializeTokensJson([{ t: 'close' }, { t: 'open', tag: 'p', h: '<p>' }]);
    expect(json).not.toContain('</');
    // 仍为合法 JSON 且内容可还原
    expect(JSON.parse(json)).toEqual([{ t: 'close' }, { t: 'open', tag: 'p', h: '<p>' }]);
  });
});

describe('resolveStreamingFile 回退链', () => {
  function withTempTree(files: string[], fn: (dir: string) => void) {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-stream-'));
    try {
      for (const rel of files) {
        const p = path.join(dir, rel);
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, '', 'utf8');
      }
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('优先页面语言目录', () => {
    withTempTree(['streaming/zh/welcome.md', 'streaming/en/welcome.md'], (dir) => {
      expect(resolveStreamingFile(dir, 'streaming/welcome.md', 'zh', 'zh')).toBe(
        path.join(dir, 'streaming/zh/welcome.md'),
      );
    });
  });

  it('页面语言缺失时回退 en，再回退默认语言', () => {
    withTempTree(['streaming/en/welcome.md'], (dir) => {
      expect(resolveStreamingFile(dir, 'streaming/welcome.md', 'zh', 'zh')).toBe(
        path.join(dir, 'streaming/en/welcome.md'),
      );
    });
    withTempTree(['streaming/zh/welcome.md'], (dir) => {
      // 页面语言 fr → en 无 → 默认 zh
      expect(resolveStreamingFile(dir, 'streaming/welcome.md', 'fr', 'zh')).toBe(
        path.join(dir, 'streaming/zh/welcome.md'),
      );
    });
  });

  it('语言目录都没有时回退 content_file 原路径；全无返回 null', () => {
    withTempTree(['streaming/welcome.md'], (dir) => {
      expect(resolveStreamingFile(dir, 'streaming/welcome.md', 'zh', 'zh')).toBe(
        path.join(dir, 'streaming/welcome.md'),
      );
    });
    withTempTree([], (dir) => {
      expect(resolveStreamingFile(dir, 'streaming/welcome.md', 'zh', 'zh')).toBeNull();
    });
  });
});

describe('markdownToStream / loadStreamingBlock / streamEmbedHtml', () => {
  // Shiki 首次初始化秒级，预热一次（本文件含代码块用例）
  beforeAll(async () => {
    await markdownToStream('```js\nwarmup\n```');
  }, 60000);

  it('markdown → html 与 tokens 结构一致', async () => {
    const { html, tokens } = await markdownToStream('你好，**世界**');
    expect(html).toContain('<strong>世界</strong>');
    expect(tokens.map((t) => t.t)).toEqual([
      'open', 'text', 'text', 'text', 'open', 'text', 'text', 'close', 'close',
    ]);
  });

  it('代码块 token 化：逐行 node + 保留 shiki 开标签', async () => {
    const { tokens } = await markdownToStream('```js\nconst a = 1;\n```');
    const open = tokens.find((t) => t.t === 'open') as Extract<StreamToken, { t: 'open' }>;
    expect(open.tag).toBe('pre');
    expect(open.h).toContain('shiki');
    const lines = tokens.filter((t) => t.t === 'node');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('loadStreamingBlock：读文件、解析双语标题、缺文件 warning 返回 null', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oh-stream-'));
    try {
      mkdirSync(path.join(dir, 'streaming/zh'), { recursive: true });
      writeFileSync(path.join(dir, 'streaming/zh/welcome.md'), '欢迎 **朋友**', 'utf8');
      const block = await loadStreamingBlock(
        dir,
        { id: 'welcome', title: { zh: '一段话', en: 'In short' }, content_file: 'streaming/welcome.md', speed: 50 },
        'zh',
        'zh',
      );
      expect(block).not.toBeNull();
      expect(block!.title).toBe('一段话');
      expect(block!.speed).toBe(50);
      expect(block!.autoplay).toBe(true);
      expect(block!.html).toContain('<strong>朋友</strong>');
      expect(block!.tokens.length).toBeGreaterThan(0);

      const warn = vi.fn();
      const missing = await loadStreamingBlock(
        dir,
        { id: 'nope', content_file: 'streaming/nope.md' },
        'zh',
        'zh',
        warn,
      );
      expect(missing).toBeNull();
      expect(warn.mock.calls[0][0]).toContain('nope');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('streamEmbedHtml：结构含播放容器/noscript 完整内容/tokens JSON/重播按钮', async () => {
    const { html, tokens } = await markdownToStream('内容');
    const frag = streamEmbedHtml({
      id: 'welcome',
      title: '一段话',
      autoplay: true,
      speed: DEFAULT_STREAM_SPEED,
      html,
      tokens,
    });
    expect(frag).toContain('class="stream-block"');
    expect(frag).toContain('data-stream-id="welcome"');
    expect(frag).toContain('data-autoplay="true"');
    expect(frag).toContain('data-speed="40"');
    expect(frag).toContain('class="stream-replay"');
    expect(frag).toContain('<noscript>');
    expect(frag).toContain('<p>内容</p>');
    expect(frag).toContain('class="stream-tokens"');
    // noscript 之外的播放容器初始为空
    expect(frag).toContain('<div class="stream-content markdown-body"></div>');
  });

  it('streamEmbedHtml 转义标题中的 HTML 特殊字符', async () => {
    const { html, tokens } = await markdownToStream('x');
    const frag = streamEmbedHtml({
      id: 'a',
      title: '<b>不注入</b>',
      autoplay: false,
      speed: 40,
      html,
      tokens,
    });
    expect(frag).toContain('&lt;b&gt;不注入&lt;/b&gt;');
    expect(frag).not.toContain('<b>不注入</b>');
    expect(frag).toContain('data-autoplay="false"');
  });
});

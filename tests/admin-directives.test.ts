/**
 * 指令节点往返测试（jsdom）：markdown 指令 → Milkdown 解析 → 序列化回指令语法。
 * 覆盖 03 文档全部指令：bilibili/youtube/video/audio/figure/grid/stream/ghcard。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestEditor, serializeMarkdown } from '../admin/ui/editor/create-editor.ts';

let serialize: (md: string) => string;

beforeAll(async () => {
  const editor = await createTestEditor();
  serialize = (md: string) => serializeMarkdown(editor, md);
});

describe('叶指令往返（::name{attrs}）', () => {
  it('bilibili / youtube / stream / ghcard', async () => {
    expect(await serialize('::bilibili{bvid="BV1xx411c7mD"}\n')).toContain(
      '::bilibili{bvid="BV1xx411c7mD"}'
    );
    expect(await serialize('::youtube{id="dQw4w9WgXcQ"}\n')).toMatch(
      /::youtube\{(?:#dQw4w9WgXcQ|id="dQw4w9WgXcQ")\}/
    );
    expect(await serialize('::stream{id="welcome"}\n')).toMatch(
      /::stream\{(?:#welcome|id="welcome")\}/
    );
    expect(await serialize('::ghcard{repo="owner/repo"}\n')).toContain(
      '::ghcard{repo="owner/repo"}'
    );
  });
});

describe('空容器指令往返（video/audio/figure）', () => {
  it('video 保留 src 与 poster', async () => {
    const out = await serialize(':::video{src="assets/demo.mp4" poster="assets/cover.png"}\n:::\n');
    expect(out).toContain(':::video{src="assets/demo.mp4" poster="assets/cover.png"}');
    expect(out).toContain(':::');
  });

  it('audio / figure 保留参数', async () => {
    expect(await serialize(':::audio{src="assets/podcast.mp3"}\n:::\n')).toContain(
      ':::audio{src="assets/podcast.mp3"}'
    );
    const out = await serialize(':::figure{src="assets/photo.jpg" caption="图 1" width="70%"}\n:::\n');
    expect(out).toContain(':::figure{src="assets/photo.jpg" caption="图 1" width="70%"}');
  });

  it('figure 往返保留 align 对齐参数', async () => {
    const out = await serialize(
      ':::figure{src="assets/photo.jpg" width="72%" align="center"}\n:::\n'
    );
    expect(out).toContain('align="center"');
    expect(out).toContain('width="72%"');
  });
});

describe('grid 嵌套容器往返', () => {
  it('外层冒号数多于内层，单元格 markdown 保留', async () => {
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
    const out = await serialize(md);
    expect(out).toContain('::::grid{cols="2"}');
    expect(out.match(/:::cell/g)?.length).toBe(2);
    expect(out).toContain('左栏 **加粗**');
    expect(out).toContain('右栏');
  });
});

describe('与普通 markdown 混排', () => {
  it('标题/列表/公式/指令共存互不干扰', async () => {
    const md = '# 标题\n\n- 项目\n\n::stream{id="welcome"}\n\n$$a+b$$\n';
    const out = await serialize(md);
    expect(out).toContain('# 标题');
    expect(out).toMatch(/[*-] 项目/);
    expect(out).toMatch(/::stream\{(?:#welcome|id="welcome")\}/);
    expect(out).toContain('$$');
  });
});

describe('未识别指令降级', () => {
  it('正文中的 "16:9" 被 remark-directive 误解析为 textDirective，降级为原文不抛错', async () => {
    const out = await serialize('播放器以响应式 16:9 容器渲染。\n');
    expect(out).toContain('16:9 容器');
  });

  it('未识别的叶/容器指令按原文文本降级保留', async () => {
    const out = await serialize('::unknown{a="1"}\n');
    expect(out).toContain('::unknown{a="1"}');
    const out2 = await serialize(':::unknown{a="1"}\n内容\n:::\n');
    expect(out2).toContain(':::unknown{a="1"}');
    expect(out2).toContain('内容');
  });

  it('grid 单元格内同冒号数误嵌套的 figure 不丢内容（纯冒号残留段落被移除）', async () => {
    const md =
      '::::grid{cols=2}\n:::cell\n左\n:::\n:::cell\n:::figure{src="assets/x.jpg"}\n:::\n:::\n::::\n';
    const out = await serialize(md);
    expect(out).toContain('figure{src="assets/x.jpg"}');
    expect(out).toContain('左');
    // 序列化自动把外层冒号数加大（grid 5 冒号 > cell 4 冒号 > figure 3 冒号），形成正确嵌套
    expect(out).toContain(':::::grid');
    expect(out).toContain('::::cell');
    // 再次解析-序列化结果稳定（无残留 ":::" 文本段落）
    expect(await serialize(out)).toBe(out);
  });
});

/**
 * 可编辑块坐标枚举与块拼接（src/lib/edit-blocks.ts）单测：
 * 各类块/指令/grid 嵌套/误嵌套残留围栏的坐标枚举；replace/insert/delete/move 拼接往返。
 */
import { describe, it, expect } from 'vitest';
import {
  listEditableBlocks,
  blockLineSpan,
  replaceBlock,
  insertBlock,
  deleteBlock,
  moveBlock,
} from '../src/lib/edit-blocks.ts';

/** 块列表 → 源码切片（坐标正确性的直接验证） */
function slices(body: string): string[] {
  return listEditableBlocks(body).map((b) => body.slice(b.start, b.end));
}

describe('listEditableBlocks：各类块枚举', () => {
  it('段落/标题/列表/引用/代码/数学/表格/html/分割线，坐标切片即源码', () => {
    const md = [
      '# 标题',
      '',
      '第一段 **加粗**。',
      '',
      '- 甲',
      '- 乙',
      '',
      '> 引用块',
      '',
      '```js',
      'const a = 1;',
      '```',
      '',
      '$$',
      'x^2',
      '$$',
      '',
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      '<div>混写</div>',
      '',
      '---',
      '',
    ].join('\n');
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'blockquote',
      'code',
      'math',
      'table',
      'html',
      'thematicBreak',
    ]);
    expect(blocks[0].start).toBe(0);
    expect(slices(md)).toEqual([
      '# 标题',
      '第一段 **加粗**。',
      '- 甲\n- 乙',
      '> 引用块',
      '```js\nconst a = 1;\n```',
      '$$\nx^2\n$$',
      '| a | b |\n| - | - |\n| 1 | 2 |',
      '<div>混写</div>',
      '---',
    ]);
    expect(blocks.every((b) => b.parent === 'root')).toBe(true);
    expect(blocks.every((b) => b.name === undefined)).toBe(true);
  });

  it('叶指令与容器指令带 name', () => {
    const md = [
      '::stream{id="welcome"}',
      '',
      ':::figure{src="assets/a.jpg"}',
      ':::',
      '',
      '::bilibili{bvid="BV1xx411c7mD"}',
      '',
    ].join('\n');
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => [b.kind, b.name])).toEqual([
      ['leafDirective', 'stream'],
      ['containerDirective', 'figure'],
      ['leafDirective', 'bilibili'],
    ]);
    expect(md.slice(blocks[0].start, blocks[0].end)).toBe('::stream{id="welcome"}');
  });
});

describe('listEditableBlocks：grid/cell 递归', () => {
  it('grid > cell 内部块递归枚举，parent 指向父块坐标', () => {
    const md = [
      '前文',
      '',
      '::::grid{cols=2}',
      ':::cell',
      '左栏',
      ':::',
      ':::cell',
      '右栏',
      ':::',
      '::::',
      '',
    ].join('\n');
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => `${b.kind}${b.name ? `:${b.name}` : ''}`)).toEqual([
      'paragraph',
      'containerDirective:grid',
      'containerDirective:cell',
      'paragraph',
      'containerDirective:cell',
      'paragraph',
    ]);
    const [intro, grid, cellA, left, cellB, right] = blocks;
    expect(intro.parent).toBe('root');
    expect(grid.parent).toBe('root');
    expect(cellA.parent).toBe(`${grid.start}:${grid.end}`);
    expect(left.parent).toBe(`${cellA.start}:${cellA.end}`);
    expect(cellB.parent).toBe(`${grid.start}:${grid.end}`);
    expect(right.parent).toBe(`${cellB.start}:${cellB.end}`);
    expect(md.slice(left.start, left.end)).toBe('左栏');
    expect(md.slice(right.start, right.end)).toBe('右栏');
  });

  it('嵌套 grid（外层冒号数多于内层）继续递归到最内层块', () => {
    const md = [
      ':::::grid{cols=2}',
      '::::cell',
      '外层块',
      '',
      ':::grid{cols=2}',
      '内层块',
      ':::',
      '::::',
      ':::::',
      '',
    ].join('\n');
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => `${b.kind}${b.name ? `:${b.name}` : ''}`)).toEqual([
      'containerDirective:grid',
      'containerDirective:cell',
      'paragraph',
      'containerDirective:grid',
      'paragraph',
    ]);
    const [outer, cell, outerP, inner, innerP] = blocks;
    expect(cell.parent).toBe(`${outer.start}:${outer.end}`);
    expect(outerP.parent).toBe(`${cell.start}:${cell.end}`);
    expect(inner.parent).toBe(`${cell.start}:${cell.end}`);
    expect(innerP.parent).toBe(`${inner.start}:${inner.end}`);
    expect(md.slice(innerP.start, innerP.end)).toBe('内层块');
  });

  it('误嵌套残留的纯冒号围栏段落被枚举为普通 paragraph（渲染侧移除，坐标保持一致）', () => {
    // cell 与 figure 同为 ::: 时闭合围栏被合并消费，多余 ::: 解析成 grid 内的文本段落
    const md = [
      '::::grid{cols=2}',
      ':::cell',
      ':::figure{src="assets/a.jpg"}',
      ':::',
      ':::',
      '::::',
      '',
    ].join('\n');
    const blocks = listEditableBlocks(md);
    expect(blocks.map((b) => b.kind)).toEqual([
      'containerDirective',
      'containerDirective',
      'containerDirective',
      'paragraph',
    ]);
    const residue = blocks[3];
    expect(md.slice(residue.start, residue.end)).toBe(':::');
    expect(residue.parent).toBe(`${blocks[0].start}:${blocks[0].end}`);
  });
});

describe('blockLineSpan：整行区间', () => {
  const md = '甲。\n\n乙。\n';
  it('扩展为含行尾换行的行区间', () => {
    const blocks = listEditableBlocks(md);
    expect(blockLineSpan(md, blocks[0].start, blocks[0].end)).toEqual([0, 3]);
    expect(blockLineSpan(md, blocks[1].start, blocks[1].end)).toEqual([4, 7]);
  });

  it('起点/终点不在整行边界时抛错', () => {
    expect(() => blockLineSpan('甲乙\n', 1, 2)).toThrow(/非法的块坐标/);
    expect(() => blockLineSpan('甲\n乙\n', 0, 2)).toThrow(/非法的块坐标/);
    expect(() => blockLineSpan(md, -1, 2)).toThrow(/非法的块坐标/);
  });
});

describe('块拼接：replace/insert/delete/move', () => {
  it('replace：整块替换，前后块与空行不动，重解析稳定', () => {
    const md = '# 旧标题\n\n第一段。\n\n第二段。\n';
    const blocks = listEditableBlocks(md);
    const next = replaceBlock(md, blocks[1].start, blocks[1].end, '**新**段落');
    expect(next).toBe('# 旧标题\n\n**新**段落\n\n第二段。\n');
    expect(slices(next)).toEqual(['# 旧标题', '**新**段落', '第二段。']);
  });

  it('replace：支持换成指令块', () => {
    const md = '甲。\n\n乙。\n';
    const blocks = listEditableBlocks(md);
    const next = replaceBlock(md, blocks[0].start, blocks[0].end, '::stream{id="s"}');
    expect(slices(next)).toEqual(['::stream{id="s"}', '乙。']);
    expect(listEditableBlocks(next)[0].name).toBe('stream');
  });

  it('insert：块行尾边界插入 = 插到该块之后（自动补空行）', () => {
    const md = '甲。\n\n乙。\n';
    const blocks = listEditableBlocks(md);
    const [, ee] = blockLineSpan(md, blocks[0].start, blocks[0].end);
    const next = insertBlock(md, ee, '丙。');
    expect(next).toBe('甲。\n\n丙。\n\n乙。\n');
    expect(slices(next)).toEqual(['甲。', '丙。', '乙。']);
  });

  it('insert：文首（0）与文末（body.length）边界', () => {
    const md = '甲。\n';
    expect(insertBlock(md, 0, '首段。')).toBe('首段。\n\n甲。\n');
    expect(insertBlock(md, md.length, '末段。')).toBe('甲。\n\n末段。\n');
    // 空文档
    expect(slices(insertBlock('', 0, '唯一段。'))).toEqual(['唯一段。']);
  });

  it('insert：相邻块间无空行时也补空行，避免合块', () => {
    const md = '# 标题\n紧跟着的段落。\n';
    const blocks = listEditableBlocks(md);
    const [ls] = blockLineSpan(md, blocks[1].start, blocks[1].end);
    const next = insertBlock(md, ls, '插入段。');
    expect(slices(next)).toEqual(['# 标题', '插入段。', '紧跟着的段落。']);
  });

  it('delete：删除块并收走一个相邻空行', () => {
    const md = '甲。\n\n乙。\n\n丙。\n';
    const b = listEditableBlocks(md);
    expect(deleteBlock(md, b[1].start, b[1].end)).toBe('甲。\n\n丙。\n');
    expect(deleteBlock(md, b[0].start, b[0].end)).toBe('乙。\n\n丙。\n');
    expect(deleteBlock(md, b[2].start, b[2].end)).toBe('甲。\n\n乙。\n');
  });

  it('move：跨块移动（剪除后偏移回移），往返重解析稳定', () => {
    const md = '甲。\n\n乙。\n\n丙。\n';
    const b = listEditableBlocks(md);
    // 丙 → 文首
    expect(moveBlock(md, b[2].start, b[2].end, 0)).toBe('丙。\n\n甲。\n\n乙。\n');
    // 甲 → 乙 之后
    const [, eeB] = blockLineSpan(md, b[1].start, b[1].end);
    const moved = moveBlock(md, b[0].start, b[0].end, eeB);
    expect(moved).toBe('乙。\n\n甲。\n\n丙。\n');
    expect(slices(moved)).toEqual(['乙。', '甲。', '丙。']);
    // 原地移动为空操作
    const [lsA, eeA] = blockLineSpan(md, b[0].start, b[0].end);
    expect(moveBlock(md, b[0].start, b[0].end, lsA)).toBe(md);
    expect(moveBlock(md, b[0].start, b[0].end, eeA)).toBe(md);
  });

  it('move：grid cell 内部移动（坐标递归块同样可拼接）', () => {
    const md = '::::grid\n:::cell\n甲\n\n乙\n:::\n::::\n';
    const blocks = listEditableBlocks(md);
    const inner = blocks.filter((p) => p.kind === 'paragraph');
    // 乙 → 甲 之前
    const [lsA] = blockLineSpan(md, inner[0].start, inner[0].end);
    const next = moveBlock(md, inner[1].start, inner[1].end, lsA);
    // 解析等价：块顺序变为 乙/甲；容器开闭围栏旁可能残留装饰性空行（合法 markdown，M12a 不做美化）
    expect(slices(next)).toEqual(['::::grid\n:::cell\n\n乙\n\n甲\n\n:::\n::::', ':::cell\n\n乙\n\n甲\n\n:::', '乙', '甲']);
  });

  it('拼接幂等性：replace 同内容后坐标不变', () => {
    const md = '甲。\n\n乙。\n';
    const b = listEditableBlocks(md);
    const next = replaceBlock(md, b[0].start, b[0].end, '甲。');
    expect(next).toBe(md);
    expect(listEditableBlocks(next)).toEqual(b);
  });
});

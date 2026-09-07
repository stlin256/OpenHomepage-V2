import { beforeAll, describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.ts';

beforeAll(async () => {
  await renderMarkdown('```js\nwarmup\n```');
}, 60000);

describe('Mermaid 源码块与指令', () => {
  it('```mermaid 代码块渲染为 .mermaid-block 源码块', async () => {
    const html = await renderMarkdown('```mermaid\ngraph TD;\nA --> B;\n```');
    expect(html).toContain('<div class="mermaid-block" data-mermaid="true">');
    expect(html).toContain('<pre class="mermaid-source">');
    expect(html).toContain('graph TD;');
    expect(html).toContain('A --> B;');
    expect(html).not.toContain('shiki');
  });

  it(':::mermaid 容器指令输出同样的源码块', async () => {
    const html = await renderMarkdown(':::mermaid\ngraph TD;\nA --> B;\n:::');
    expect(html).toContain('<div class="mermaid-block" data-mermaid="true">');
    expect(html).toContain('<pre class="mermaid-source">');
    expect(html).toContain('graph TD;');
    expect(html).toContain('A --> B;');
  });

  it('Mermaid 源码中的 HTML 作为文本转义，不进入可执行 DOM', async () => {
    const html = await renderMarkdown('```mermaid\n<script>alert(1)</script>\n```');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&#x3C;script>');
  });

  it('普通代码块仍走 Shiki 高亮', async () => {
    const html = await renderMarkdown('```js\nconst a = 1;\n```');
    expect(html).toContain('shiki');
    expect(html).not.toContain('mermaid-block');
  });
});

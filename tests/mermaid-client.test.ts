/**
 * Mermaid 客户端渲染脚本（src/scripts/mermaid.ts）jsdom 测试：
 * 源码块渲染、错误降级、主题配置与重渲染。
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MermaidRenderer,
} from '../src/scripts/mermaid.ts';

let currentMermaidTheme: () => 'light' | 'dark';
let mermaidConfigFor: (theme: 'light' | 'dark') => Record<string, unknown>;
let renderMermaidBlock: (block: HTMLElement, renderer: MermaidRenderer) => Promise<void>;
let initMermaidBlocks: (scope?: ParentNode, renderer?: MermaidRenderer) => Promise<void>;
let rerenderMermaidBlocks: (scope?: ParentNode, renderer?: MermaidRenderer) => Promise<void>;

function blockHtml(source = 'graph TD;\nA --> B;'): string {
  return `<div class="mermaid-block"><pre class="mermaid-source"><code>${source}</code></pre></div>`;
}

function makeRenderer(svg = '<svg id="rendered"></svg>'): MermaidRenderer & {
  initialize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
} {
  return {
    initialize: vi.fn((_config: Record<string, unknown>) => {}),
    render: vi.fn(async (id: string, _text: string) => ({
      svg: svg.replace('rendered', id),
      bindFunctions: vi.fn(),
    })),
  };
}

beforeEach(async () => {
  vi.resetModules();
  document.documentElement.dataset.theme = 'light';
  document.body.innerHTML = '';
  ({ currentMermaidTheme, mermaidConfigFor, renderMermaidBlock, initMermaidBlocks, rerenderMermaidBlocks } =
    await import('../src/scripts/mermaid.ts'));
});

afterEach(() => {
  document.body.innerHTML = '';
  document.documentElement.dataset.theme = 'light';
  vi.restoreAllMocks();
});

describe('主题读取与配置', () => {
  it('按 html data-theme 判断明暗主题', () => {
    expect(currentMermaidTheme()).toBe('light');
    document.documentElement.dataset.theme = 'dark';
    expect(currentMermaidTheme()).toBe('dark');
  });

  it('使用 base theme 与严格安全级别，并映射站点 CSS 变量', () => {
    const config = mermaidConfigFor('dark');
    expect(config).toMatchObject({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
    });
    expect(config.themeVariables).toBeTruthy();
  });
});

describe('renderMermaidBlock', () => {
  it('渲染成功后写入 .mermaid-rendered 并隐藏源码', async () => {
    document.body.innerHTML = blockHtml();
    const block = document.querySelector<HTMLElement>('.mermaid-block')!;
    const renderer = makeRenderer();

    await renderMermaidBlock(block, renderer);

    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(block.dataset.mermaidReady).toBe('true');
    expect(block.dataset.mermaidError).toBe('');
    expect(block.querySelector('.mermaid-rendered')?.innerHTML).toContain('<svg');
    expect(block.querySelector('.mermaid-rendered svg')?.id).toContain('oh-mermaid-');
  });

  it('渲染失败时保留源码块并记录错误', async () => {
    document.body.innerHTML = blockHtml();
    const block = document.querySelector<HTMLElement>('.mermaid-block')!;
    const renderer = makeRenderer();
    (renderer.render as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('bad diagram'));

    await renderMermaidBlock(block, renderer);

    expect(block.dataset.mermaidReady).toBe('false');
    expect(block.dataset.mermaidError).toBe('bad diagram');
    expect(block.querySelector('.mermaid-source')).not.toBeNull();
    expect(block.querySelector('.mermaid-rendered')).toBeNull();
  });

  it('空源码不调用 Mermaid 渲染，并标记为空错误', async () => {
    document.body.innerHTML = blockHtml('');
    const block = document.querySelector<HTMLElement>('.mermaid-block')!;
    const renderer = makeRenderer();

    await renderMermaidBlock(block, renderer);

    expect(renderer.render).not.toHaveBeenCalled();
    expect(block.dataset.mermaidReady).toBe('false');
    expect(block.dataset.mermaidError).toBe('empty');
  });
});

describe('initMermaidBlocks / rerenderMermaidBlocks', () => {
  it('无图表时直接返回，不初始化渲染器', async () => {
    const renderer = makeRenderer();
    await initMermaidBlocks(document, renderer);
    expect(renderer.initialize).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('初始化页面内所有未就绪的图表', async () => {
    document.body.innerHTML = blockHtml() + blockHtml('flowchart LR\nA --> C');
    const renderer = makeRenderer();

    await initMermaidBlocks(document, renderer);

    expect(renderer.initialize).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('.mermaid-block[data-mermaid-ready="true"]')).toHaveLength(2);
  });

  it('主题变化时对全部图表重渲染', async () => {
    let observerCallback: MutationCallback | null = null;
    class FakeMutationObserver {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('MutationObserver', FakeMutationObserver);

    document.body.innerHTML = blockHtml();
    const renderer = makeRenderer();
    await initMermaidBlocks(document, renderer);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    expect(observerCallback).toBeTruthy();
    document.documentElement.dataset.theme = 'dark';
    observerCallback!([], {} as MutationObserver);
    await Promise.resolve();

    expect(renderer.render).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it('rerenderMermaidBlocks 会重新渲染已就绪的图表', async () => {
    document.body.innerHTML = blockHtml();
    const block = document.querySelector<HTMLElement>('.mermaid-block')!;
    const renderer = makeRenderer();
    await renderMermaidBlock(block, renderer);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    await rerenderMermaidBlocks(document, renderer);
    expect(renderer.render).toHaveBeenCalledTimes(2);
  });
});

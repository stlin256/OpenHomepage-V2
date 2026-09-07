/**
 * Mermaid 图表客户端渲染：检测 .mermaid-block，把其中的 Mermaid DSL 渲染为 SVG。
 *
 * 服务端只输出含源码的 .mermaid-block（` ```mermaid ` 代码块与 `:::mermaid` 指令），
 * 这里按需动态加载 mermaid 包，避免无图表的页面承担其体积。渲染成功时隐藏源码、
 * 展示 SVG；失败时保留源码块供阅读/复制，不阻断页面。
 *
 * 主题使用 Mermaid 的 base theme + 站点 CSS 变量，跟随亮/暗主题切换自动重渲染。
 */

export type MermaidTheme = 'light' | 'dark';

export interface MermaidRenderResult {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

export interface MermaidRenderer {
  initialize(config: Record<string, unknown>): void;
  render(id: string, text: string): Promise<MermaidRenderResult>;
}

let rendererPromise: Promise<MermaidRenderer> | null = null;
let themeObserverStarted = false;
let lastObservedTheme: MermaidTheme | null = null;
let observedRenderer: MermaidRenderer | null = null;
let nextBlockId = 0;

function loadMermaidRenderer(): Promise<MermaidRenderer> {
  if (!rendererPromise) {
    rendererPromise = import('mermaid').then((module) => {
      const value = module.default ?? module;
      return value as unknown as MermaidRenderer;
    });
  }
  return rendererPromise;
}

export function currentMermaidTheme(): MermaidTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function cssVariable(name: string, fallback: string): string {
  const value = document.defaultView
    ?.getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function mermaidConfigFor(theme: MermaidTheme): Record<string, unknown> {
  const background = cssVariable('--card', theme === 'dark' ? '#201e1b' : '#fffcf7');
  const text = cssVariable('--text', theme === 'dark' ? '#f0ede7' : '#181a17');
  const border = cssVariable('--border', theme === 'dark' ? '#37332d' : '#e5dfd2');
  const subtle = cssVariable('--bg-subtle', theme === 'dark' ? '#1c1a18' : '#f2efe7');
  const accent = cssVariable('--accent', theme === 'dark' ? '#f87171' : '#c85a32');
  const fontFamily = cssVariable(
    '--font-sans',
    "'Segoe UI', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif",
  );

  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily,
    themeVariables: {
      background,
      primaryColor: accent,
      primaryTextColor: text,
      primaryBorderColor: border,
      lineColor: border,
      secondaryColor: subtle,
      tertiaryColor: subtle,
      fontFamily,
      fontSize: '14px',
    },
  };
}

function blockId(block: HTMLElement): string {
  if (!block.dataset.mermaidId) {
    nextBlockId += 1;
    block.dataset.mermaidId = `oh-mermaid-${nextBlockId}`;
  }
  return block.dataset.mermaidId;
}

export async function renderMermaidBlock(
  block: HTMLElement,
  renderer: MermaidRenderer,
): Promise<void> {
  const source = block.querySelector('code')?.textContent ?? '';
  block.dataset.mermaidError = '';
  if (!source.trim()) {
    block.dataset.mermaidReady = 'false';
    block.dataset.mermaidError = 'empty';
    return;
  }

  try {
    const result = await renderer.render(blockId(block), source);
    let rendered = block.querySelector<HTMLElement>('.mermaid-rendered');
    if (!rendered) {
      rendered = block.ownerDocument.createElement('div');
      rendered.className = 'mermaid-rendered';
      block.append(rendered);
    }
    rendered.innerHTML = result.svg;
    result.bindFunctions?.(rendered);
    block.dataset.mermaidReady = 'true';
    block.dataset.mermaidError = '';
  } catch (error) {
    block.dataset.mermaidReady = 'false';
    block.dataset.mermaidError = error instanceof Error ? error.message : String(error);
  }
}

export async function rerenderMermaidBlocks(
  scope: ParentNode = document,
  renderer?: MermaidRenderer,
): Promise<void> {
  const blocks = Array.from(scope.querySelectorAll<HTMLElement>('.mermaid-block'));
  if (blocks.length === 0) return;

  const activeRenderer = renderer ?? await loadMermaidRenderer();
  activeRenderer.initialize(mermaidConfigFor(currentMermaidTheme()));
  for (const block of blocks) {
    await renderMermaidBlock(block, activeRenderer);
  }
}

function ensureThemeObserver(renderer?: MermaidRenderer): void {
  if (renderer) observedRenderer = renderer;
  if (themeObserverStarted || typeof MutationObserver === 'undefined') return;
  themeObserverStarted = true;
  lastObservedTheme = currentMermaidTheme();

  const observer = new MutationObserver(() => {
    const nextTheme = currentMermaidTheme();
    if (nextTheme === lastObservedTheme) return;
    lastObservedTheme = nextTheme;
    void rerenderMermaidBlocks(document, observedRenderer ?? undefined);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

export async function initMermaidBlocks(
  scope: ParentNode = document,
  renderer?: MermaidRenderer,
): Promise<void> {
  const blocks = Array.from(
    scope.querySelectorAll<HTMLElement>('.mermaid-block:not([data-mermaid-ready="true"])'),
  );
  if (blocks.length === 0) return;

  const activeRenderer = renderer ?? await loadMermaidRenderer();
  activeRenderer.initialize(mermaidConfigFor(currentMermaidTheme()));
  ensureThemeObserver(activeRenderer);
  for (const block of blocks) {
    await renderMermaidBlock(block, activeRenderer);
  }
}

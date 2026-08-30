/**
 * 流式区块播放器（docs/specs/04）：
 * - IntersectionObserver 50% 可见时 autoplay 一次（离开再回来不重播）；
 * - 常驻重播按钮；播放中闪烁光标（主题色），播完隐藏；
 * - speed ms/token ±40% 抖动、标点后短停顿（节奏计算在 src/lib/interactive.ts）；
 * - 增量插入 DOM：open/text/close/node 指令流 + 元素栈，结构随播随成型；
 * - prefers-reduced-motion → 直接完整呈现；无 JS → <noscript> 完整内容（构建期内联）；
 * - autoplay: false → 直接完整呈现，重播按钮仍可动画重播（决策见 spec 04 §2）。
 * - 可视化编辑模式（M12g）：<html class="oh-edit">（编辑 bootstrap 同步加注）时不初始化
 *   打字机，直接把完整内容渲染进 .stream-content（与 noscript 同一份 HTML）——编辑 overlay
 *   要打开流式内容编辑窗口，动画与静态编辑冲突；重播按钮隐藏（overlay.css），
 *   脚本侧同样兜底为完整呈现。生产模式无该 class，行为零变化。
 */
import { tokenDelay } from '../lib/interactive.ts';
import type { StreamToken } from '../lib/stream.ts';

interface PlayerCtx {
  root: HTMLElement;
  content: HTMLElement;
  tokens: StreamToken[];
  speed: number;
  cursor: HTMLElement;
  /** 播放代际：重播时自增，旧循环自然终止 */
  generation: number;
  stack: Element[];
  heightTimer?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 可视化编辑模式（编辑 bootstrap 同步给 <html> 加 oh-edit，早于本模块执行）：不播打字机 */
function editMode(): boolean {
  return document.documentElement.classList.contains('oh-edit');
}

/** noscript 内的完整 HTML（JS 开启时 noscript 不入 DOM，textContent 取字符串） */
function fullHtml(root: HTMLElement): string {
  return root.querySelector('noscript')?.textContent ?? '';
}

function renderFull(root: HTMLElement, content: HTMLElement): void {
  content.style.height = '';
  content.innerHTML = fullHtml(root);
  root.classList.add('stream-done');
}

/** 逐 token 增长时把内容高度从当前值过渡到新值，避免容器瞬间跳高。 */
function animateContentGrowth(ctx: PlayerCtx, previousHeight: number, generation: number): void {
  const nextHeight = ctx.content.scrollHeight;
  if (nextHeight <= previousHeight + 0.5) return;

  ctx.content.style.height = `${previousHeight}px`;
  void ctx.content.offsetHeight;
  ctx.content.style.height = `${nextHeight}px`;

  if (ctx.heightTimer !== undefined) window.clearTimeout(ctx.heightTimer);
  ctx.heightTimer = window.setTimeout(() => {
    if (ctx.generation === generation) ctx.content.style.height = '';
  }, 140);
}

/** 在当前栈顶、光标之前插入节点。 */
function insertNode(ctx: PlayerCtx, node: Node): void {
  const top = ctx.stack[ctx.stack.length - 1];
  if (ctx.cursor.parentNode === top) top.insertBefore(node, ctx.cursor);
  else top.appendChild(node);
}

/** 打开元素后把光标带入元素，保证文本与光标处于同一行流中。 */
function enterElement(ctx: PlayerCtx, element: Element): void {
  ctx.stack.push(element);
  element.appendChild(ctx.cursor);
}

/** 闭合元素后把光标移到元素之后，等待下一个兄弟节点。 */
function leaveElement(ctx: PlayerCtx): void {
  if (ctx.stack.length <= 1) return;
  const element = ctx.stack.pop()!;
  const parent = ctx.stack[ctx.stack.length - 1];
  if (element.parentNode === parent) parent.insertBefore(ctx.cursor, element.nextSibling);
  else parent.appendChild(ctx.cursor);
}

function appendText(ctx: PlayerCtx, w: string): void {
  const top = ctx.stack[ctx.stack.length - 1];
  // 与前一文本节点合并，减少 DOM 节点数
  const prev =
    ctx.cursor.parentNode === top ? ctx.cursor.previousSibling : top.lastChild;
  if (prev && prev.nodeType === Node.TEXT_NODE) {
    prev.textContent = `${prev.textContent}${w}`;
  } else {
    insertNode(ctx, document.createTextNode(w));
  }
}

function applyToken(ctx: PlayerCtx, token: StreamToken): void {
  switch (token.t) {
    case 'open': {
      // 用浏览器自身解析器还原开标签属性（open+close 成对解析）
      const tpl = document.createElement('template');
      tpl.innerHTML = `${token.h}</${token.tag}>`;
      const el = tpl.content.firstElementChild;
      if (!el) return;
      insertNode(ctx, el);
      enterElement(ctx, el);
      return;
    }
    case 'text':
      appendText(ctx, token.w);
      return;
    case 'node': {
      const tpl = document.createElement('template');
      tpl.innerHTML = token.h;
      for (const n of [...tpl.content.childNodes]) insertNode(ctx, n);
      return;
    }
    case 'close':
      leaveElement(ctx);
      return;
  }
}

interface PlayOptions {
  initialDelay?: number;
}

/** 自动播放先停一小拍，让页面进入/切换动画先结束，避免与打字同时发生造成抖动错觉。 */
export const AUTOPLAY_START_DELAY_MS = 300;

async function play(ctx: PlayerCtx, { initialDelay = 0 }: PlayOptions = {}): Promise<void> {
  const gen = ++ctx.generation;
  if (initialDelay > 0) {
    await sleep(initialDelay);
    if (ctx.generation !== gen) return;
  }
  ctx.content.innerHTML = '';
  ctx.stack = [ctx.content];
  ctx.cursor.hidden = false;
  ctx.content.appendChild(ctx.cursor);
  ctx.root.classList.add('stream-playing');
  for (const token of ctx.tokens) {
    if (ctx.generation !== gen) return; // 已有新一轮播放接管
    const previousHeight = ctx.content.getBoundingClientRect().height;
    applyToken(ctx, token);
    animateContentGrowth(ctx, previousHeight, gen);
    // open/close 零停顿；node（链接/图片/代码行）给一个小停顿；text 按节奏函数
    const d =
      token.t === 'text'
        ? tokenDelay(ctx.speed, token.w)
        : token.t === 'node'
          ? Math.min(ctx.speed * 3, 150)
          : 0;
    if (d > 0) await sleep(d);
  }
  ctx.cursor.hidden = true;
  ctx.root.classList.remove('stream-playing');
  ctx.root.classList.add('stream-done');
}

export function initStreamBlocks(): void {
  for (const root of document.querySelectorAll<HTMLElement>('.stream-block[data-stream-id]')) {
    if (root.dataset.streamInit) continue; // astro:page-load 重复初始化防御
    root.dataset.streamInit = '1';

    const content = root.querySelector<HTMLElement>(':scope > .stream-content');
    const tokensEl = root.querySelector<HTMLScriptElement>('script.stream-tokens');
    if (!content || !tokensEl) continue;

    let tokens: StreamToken[];
    try {
      tokens = JSON.parse(tokensEl.textContent ?? '[]') as StreamToken[];
    } catch {
      renderFull(root, content); // JSON 损坏时完整呈现
      continue;
    }

    const cursor = document.createElement('span');
    cursor.className = 'stream-cursor';
    cursor.hidden = true;

    const ctx: PlayerCtx = {
      root,
      content,
      tokens,
      speed: Number(root.dataset.speed) || 40,
      cursor,
      generation: 0,
      stack: [content],
    };

    root.querySelector<HTMLButtonElement>('.stream-replay')?.addEventListener('click', () => {
      // 显式重播尊重用户操作：reduced-motion 下也只完整呈现（spec 04 §3 全局降级）；
      // 编辑模式（M12g）同样只完整呈现（按钮已被 overlay.css 隐藏，这里是脚本兜底）
      if (reducedMotion() || editMode()) renderFull(root, content);
      else void play(ctx);
    });

    if (reducedMotion() || editMode() || root.dataset.autoplay !== 'true') {
      renderFull(root, content);
      continue;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void play(ctx, { initialDelay: AUTOPLAY_START_DELAY_MS });
        }
      },
      { threshold: 0.5 },
    );
    io.observe(root);
  }
}

/**
 * 图片灯箱（docs/specs/03 §5）：点击正文/网格图片（.markdown-body 内的 img）打开全屏预览。
 * - 灯箱骨架由 BaseLayout 服务端渲染（.lightbox，hidden），本脚本只做交互；
 * - 高分辨率变体按 -full 约定乐观加载（src/lib/lightbox.ts），失败逐级回退；
 *   失败结果缓存于 fullBad，同一会话不重复 404；与 tab-prefetch.ts 共享；
 * - 关闭：✕ 按钮 / 点击背景 / Esc；开关动画纯 CSS（global.css .lightbox）。
 * 事件全部挂在 document 上（事件委托），ClientRouter 转场后无需重绑。
 */
import { pickLightboxSrc, fullBad } from '../lib/lightbox.ts';

function overlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.lightbox');
}

function openLightbox(img: HTMLImageElement): void {
  const box = overlay();
  const view = box?.querySelector<HTMLImageElement>('.lightbox-img');
  if (!box || !view) return;
  const pageSrc = img.currentSrc || img.src;
  if (!pageSrc) return;
  // 构建优化会把非 WebP 原图保存在 data-original；灯箱优先原图及其 -full 版，
  // 全部失败时才回落到页面已缓存的 WebP。
  const originalSrc = img.dataset.original || null;
  const showCandidate = () => {
    const next = pickLightboxSrc(pageSrc, (url) => !fullBad.has(url), originalSrc);
    view.onerror =
      next === pageSrc
        ? null
        : () => {
            fullBad.add(next);
            showCandidate();
          };
    view.src = next;
  };
  showCandidate();
  view.alt = img.alt;
  box.hidden = false;
  // 强制 reflow 后再加 .open，保证 opacity/transform 过渡生效
  void box.offsetWidth;
  box.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox(box: HTMLElement): void {
  if (box.hidden || box.dataset.closing) return;
  box.dataset.closing = '1';
  box.classList.remove('open');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    box.hidden = true;
    delete box.dataset.closing;
    document.body.style.overflow = '';
    const view = box.querySelector<HTMLImageElement>('.lightbox-img');
    if (view) view.removeAttribute('src');
  };
  box.addEventListener('transitionend', (e) => {
    if (e.target === box) finish();
  });
  // reduced-motion / 无过渡环境下 transitionend 可能不触发，超时兜底
  setTimeout(finish, 350);
}

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const box = overlay();
  // 灯箱打开时：点背景（overlay 本体）或 ✕ 关闭
  if (box && !box.hidden) {
    if (target === box || target.closest('.lightbox-close')) {
      e.preventDefault();
      closeLightbox(box);
    }
    return;
  }
  const img = target.closest?.('img');
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.closest('.markdown-body')) return; // 仅正文/网格图片
  if (img.closest('a, button')) return; // 链接/按钮里的图不劫持
  openLightbox(img);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const box = overlay();
  if (box && !box.hidden) closeLightbox(box);
});

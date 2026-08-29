/**
 * 视口下方懒加载图片的轻量淡入。
 * 首屏 / LCP 图片不隐藏，避免影响首次绘制；失败时移除标记，保留浏览器回退表现。
 */
export function initImageFade(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  for (const img of document.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
    if (img.dataset.imageFade || img.complete) continue;
    // 只处理首屏之下的图片；首屏可能承担 LCP，不能等 JS 或动画。
    if (viewportHeight > 0 && img.getBoundingClientRect().top < viewportHeight * 0.9) continue;

    img.dataset.imageFade = 'pending';
    img.addEventListener(
      'load',
      () => {
        img.dataset.imageFade = 'loaded';
      },
      { once: true },
    );
    img.addEventListener(
      'error',
      () => {
        if (img.dataset.imageFade !== 'loaded') delete img.dataset.imageFade;
      },
      { once: true },
    );
  }
}

/**
 * P1 长文目录（TOC）ScrollSpy 与顶部细线阅读进度条控制。
 */

export function initToc(): void {
  const progressBar = document.querySelector<HTMLElement>('.reading-progress');
  const article = document.querySelector<HTMLElement>('.page-content, .markdown-body');
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>('.toc-link');

  if (!progressBar && tocLinks.length === 0) return;

  const headings = article
    ? Array.from(article.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'))
    : [];

  let ticking = false;

  const onScroll = () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateProgressAndSpy();
        ticking = false;
      });
      ticking = true;
    }
  };

  const updateProgressAndSpy = () => {
    // 1. Reading progress bar
    if (progressBar && article) {
      const rect = article.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const articleTop = rect.top + scrollY;
      const articleHeight = rect.height;
      const viewportHeight = window.innerHeight;

      if (articleHeight > viewportHeight) {
        const progress = Math.min(1, Math.max(0, (scrollY - articleTop) / (articleHeight - viewportHeight)));
        progressBar.style.transform = `scaleX(${progress})`;
      } else {
        progressBar.style.transform = 'scaleX(1)';
      }
    }

    // 2. ScrollSpy active heading
    if (headings.length > 0 && tocLinks.length > 0) {
      let activeHeading: HTMLElement | null = null;
      const threshold = window.innerHeight * 0.25;

      for (const h of headings) {
        const top = h.getBoundingClientRect().top;
        if (top <= threshold) {
          activeHeading = h;
        } else {
          break;
        }
      }

      if (!activeHeading && headings.length > 0) {
        activeHeading = headings[0];
      }

      if (activeHeading) {
        const activeId = activeHeading.id;
        tocLinks.forEach((link) => {
          const href = link.getAttribute('href');
          const isCurrent = href === `#${activeId}`;
          link.classList.toggle('active', isCurrent);
          if (isCurrent) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        });
      }
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  updateProgressAndSpy();
}

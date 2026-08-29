/**
 * P1 长文目录（TOC）ScrollSpy 与顶部细线阅读进度条控制。
 */

let tocBound = false;
let currentProgressBar: HTMLElement | null = null;
let currentArticle: HTMLElement | null = null;
let currentTocLinks: HTMLAnchorElement[] = [];
let currentHeadings: HTMLElement[] = [];
let ticking = false;

function updateProgressAndSpy(): void {
  // 1. Reading progress bar
  if (currentProgressBar && currentArticle) {
    const rect = currentArticle.getBoundingClientRect();
    const scrollY = window.scrollY || window.pageYOffset;
    const articleTop = rect.top + scrollY;
    const articleHeight = rect.height;
    const viewportHeight = window.innerHeight;
    const scrollDistance = articleHeight - viewportHeight;

    if (scrollDistance > 0) {
      const progress = Math.min(1, Math.max(0, (scrollY - articleTop) / scrollDistance));
      currentProgressBar.style.transform = `scaleX(${progress})`;
    } else {
      const isVisible = rect.top < viewportHeight && rect.bottom > 0;
      currentProgressBar.style.transform = isVisible ? 'scaleX(1)' : 'scaleX(0)';
    }
  }

  // 2. ScrollSpy active heading
  if (currentHeadings.length > 0 && currentTocLinks.length > 0) {
    let activeHeading: HTMLElement | null = null;
    const threshold = window.innerHeight * 0.25;

    for (const h of currentHeadings) {
      const top = h.getBoundingClientRect().top;
      if (top <= threshold) {
        activeHeading = h;
      } else {
        break;
      }
    }

    if (!activeHeading && currentHeadings.length > 0) {
      activeHeading = currentHeadings[0];
    }

    if (activeHeading) {
      const activeId = activeHeading.id;
      currentTocLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const isCurrent = href === `#${activeId}`;
        link.classList.toggle('active', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }
  }
}

const onScroll = (): void => {
  if (!ticking) {
    requestAnimationFrame(() => {
      updateProgressAndSpy();
      ticking = false;
    });
    ticking = true;
  }
};

export function initToc(): void {
  currentProgressBar = document.querySelector<HTMLElement>('.reading-progress');
  currentArticle = document.querySelector<HTMLElement>('.page-content, .markdown-body');
  currentTocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc-link'));
  currentHeadings = currentArticle
    ? Array.from(currentArticle.querySelectorAll<HTMLElement>('h2[id], h3[id], h4[id]'))
    : [];

  if (!tocBound) {
    tocBound = true;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
  }

  if (currentProgressBar || currentTocLinks.length > 0) {
    updateProgressAndSpy();
  }
}

export function _resetTocStateForTesting(): void {
  tocBound = false;
  currentProgressBar = null;
  currentArticle = null;
  currentTocLinks = [];
  currentHeadings = [];
  ticking = false;
}

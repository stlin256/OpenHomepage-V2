/**
 * P1 长文目录（TOC）ScrollSpy、阅读进度条控制与移动端折叠动画。
 */

let tocBound = false;
let currentProgressBar: HTMLElement | null = null;
let currentArticle: HTMLElement | null = null;
let currentTocLinks: HTMLAnchorElement[] = [];
let currentHeadings: HTMLElement[] = [];
let ticking = false;

const collapsibleAnimations = new WeakMap<HTMLDetailsElement, Animation>();

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function updateTocMarkers(activeLink: HTMLAnchorElement | null): void {
  const markers = document.querySelectorAll<HTMLElement>('.toc-marker');
  if (!markers.length) return;

  if (!activeLink) {
    markers.forEach((m) => {
      m.style.opacity = '0';
    });
    return;
  }

  const activeHref = activeLink.getAttribute('href');

  markers.forEach((marker) => {
    const track = marker.closest<HTMLElement>('.toc-track');
    if (!track) return;
    const targetLink = activeHref ? track.querySelector<HTMLAnchorElement>(`a[href="${activeHref}"]`) : null;
    if (targetLink) {
      const linkRect = targetLink.getBoundingClientRect();
      const trackRect = track.getBoundingClientRect();
      const topOffset = linkRect.top - trackRect.top;
      marker.style.transform = `translateY(${topOffset}px)`;
      marker.style.height = `${linkRect.height}px`;
      marker.style.opacity = '1';
    } else {
      marker.style.opacity = '0';
    }
  });
}

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
      let activeLink: HTMLAnchorElement | null = null;
      currentTocLinks.forEach((link) => {
        const href = link.getAttribute('href');
        const isCurrent = href === `#${activeId}`;
        link.classList.toggle('active', isCurrent);
        if (isCurrent) {
          link.setAttribute('aria-current', 'true');
          if (!activeLink) activeLink = link;
        } else {
          link.removeAttribute('aria-current');
        }
      });
      updateTocMarkers(activeLink);
    } else {
      currentTocLinks.forEach((link) => {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      });
      updateTocMarkers(null);
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

export function animateCollapsible(details: HTMLDetailsElement, content: HTMLElement, toOpen: boolean): void {
  if (prefersReducedMotion() || typeof content.animate !== 'function') {
    details.open = toOpen;
    details.classList.remove('is-opening', 'is-closing');
    content.style.height = '';
    content.style.overflow = '';
    return;
  }

  const runningAnimation = collapsibleAnimations.get(details);
  let currentAnimatedHeight = 0;
  let currentAnimatedOpacity = 0;
  const isCurrentlyClosing = details.classList.contains('is-closing');
  const isCurrentlyOpening = details.classList.contains('is-opening');

  if (runningAnimation) {
    const rect = content.getBoundingClientRect();
    currentAnimatedHeight = rect.height;
    const computedOpacity = parseFloat(window.getComputedStyle(content).opacity);
    currentAnimatedOpacity = isNaN(computedOpacity) ? 1 : computedOpacity;
    runningAnimation.cancel();
    collapsibleAnimations.delete(details);
  }

  if (toOpen) {
    const isReversing = runningAnimation !== undefined && (isCurrentlyClosing || isCurrentlyOpening);
    const startHeight = isReversing ? currentAnimatedHeight : 0;
    const startOpacity = isReversing ? currentAnimatedOpacity : 0;

    details.classList.add('is-opening');
    details.classList.remove('is-closing');

    content.style.overflow = 'hidden';
    content.style.height = `${startHeight}px`;

    details.open = true;

    // 测算目标高度
    content.style.height = '';
    const targetHeight = content.scrollHeight;
    content.style.height = `${startHeight}px`;

    const animation = content.animate(
      [
        { height: `${startHeight}px`, opacity: startOpacity, transform: 'translateY(-4px)' },
        { height: `${targetHeight}px`, opacity: 1, transform: 'translateY(0)' },
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both',
      }
    );

    collapsibleAnimations.set(details, animation);

    animation.onfinish = () => {
      details.classList.remove('is-opening');
      content.style.overflow = '';
      content.style.height = '';
      if (collapsibleAnimations.get(details) === animation) {
        collapsibleAnimations.delete(details);
      }
    };

    animation.oncancel = () => {
      details.classList.remove('is-opening');
      content.style.overflow = '';
      content.style.height = '';
      if (collapsibleAnimations.get(details) === animation) {
        collapsibleAnimations.delete(details);
      }
    };
  } else {
    const isReversing = runningAnimation !== undefined && (isCurrentlyClosing || isCurrentlyOpening);
    const startHeight = isReversing
      ? currentAnimatedHeight
      : (content.getBoundingClientRect().height || content.scrollHeight);
    const startOpacity = isReversing
      ? currentAnimatedOpacity
      : (parseFloat(window.getComputedStyle(content).opacity) || 1);

    details.classList.add('is-closing');
    details.classList.remove('is-opening');

    content.style.overflow = 'hidden';
    content.style.height = `${startHeight}px`;

    const animation = content.animate(
      [
        { height: `${startHeight}px`, opacity: startOpacity, transform: 'translateY(0)' },
        { height: '0px', opacity: 0, transform: 'translateY(-4px)' },
      ],
      {
        duration: 220,
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        fill: 'both',
      }
    );

    collapsibleAnimations.set(details, animation);

    animation.onfinish = () => {
      details.open = false;
      details.classList.remove('is-closing');
      content.style.overflow = '';
      content.style.height = '';
      if (collapsibleAnimations.get(details) === animation) {
        collapsibleAnimations.delete(details);
      }
    };

    animation.oncancel = () => {
      details.classList.remove('is-closing');
      content.style.overflow = '';
      content.style.height = '';
      if (collapsibleAnimations.get(details) === animation) {
        collapsibleAnimations.delete(details);
      }
    };
  }
}

export function initCollapsibleToc(): void {
  const collapsibles = document.querySelectorAll<HTMLDetailsElement>('.toc-collapsible');
  for (const details of collapsibles) {
    if (details.dataset.tocCollapsibleInit === '1') continue;
    details.dataset.tocCollapsibleInit = '1';

    const summary = details.querySelector<HTMLElement>('summary');
    const content =
      details.querySelector<HTMLElement>('.toc-collapsible-body') ??
      details.querySelector<HTMLElement>('.toc') ??
      details.querySelector<HTMLElement>('div');
    if (!summary || !content) continue;

    summary.addEventListener('click', (e) => {
      if (prefersReducedMotion() || typeof content.animate !== 'function') {
        return;
      }
      e.preventDefault();
      const shouldOpen = !details.open || details.classList.contains('is-closing');
      animateCollapsible(details, content, shouldOpen);
    });

    details.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const link = target?.closest<HTMLAnchorElement>('.toc-link');
      if (link && details.open && window.innerWidth < 1200) {
        if (!prefersReducedMotion() && typeof content.animate === 'function') {
          animateCollapsible(details, content, false);
        } else {
          details.open = false;
        }
      }
    });
  }
}

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

  initCollapsibleToc();
}

export function _resetTocStateForTesting(): void {
  tocBound = false;
  currentProgressBar = null;
  currentArticle = null;
  currentTocLinks = [];
  currentHeadings = [];
  ticking = false;
  document.querySelectorAll<HTMLElement>('.toc-marker').forEach((m) => {
    m.style.transform = '';
    m.style.height = '';
    m.style.opacity = '';
  });
  document.querySelectorAll<HTMLDetailsElement>('.toc-collapsible').forEach((el) => {
    delete el.dataset.tocCollapsibleInit;
    el.classList.remove('is-opening', 'is-closing');
    const content =
      el.querySelector<HTMLElement>('.toc-collapsible-body') ??
      el.querySelector<HTMLElement>('.toc') ??
      el.querySelector<HTMLElement>('div');
    if (content) {
      content.style.height = '';
      content.style.overflow = '';
    }
  });
}

/**
 * 富媒体脚注（Rich Media Footnotes）：
 * 1. 桌面端（hover / focus）：在正文脚注角标（a[data-footnote-ref]）旁浮现杂志风 Popover 气泡，
 *    自适应上下翻转与视口边缘防溢出，保留悬浮过渡桥，支持点击气泡内超链接、DOI、代码与数学公式；
 * 2. 移动端 / 触屏（<= 768px）：轻触角标底部滑出精致 Drawer 抽屉，搭配平滑遮罩与手势/关闭按钮；
 * 3. 页面底部（section.footnotes）：优雅学术排版与平滑回跳（Backlink）。
 */

let closeTimer: ReturnType<typeof setTimeout> | null = null;
let activeRef: HTMLElement | null = null;

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= 768 || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollToAnchorOffset(target: HTMLElement): void {
  const targetRect = target.getBoundingClientRect();
  const currentScrollY = window.scrollY || window.pageYOffset || 0;
  const headerOffset = window.innerWidth <= 768 ? 72 : 80;
  const finalScrollY = Math.max(0, targetRect.top + currentScrollY - headerOffset);
  window.scrollTo({
    top: finalScrollY,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}

function ensureElements(): {
  popover: HTMLElement;
  arrow: HTMLElement;
  pBadge: HTMLElement;
  pBody: HTMLElement;
  pClose: HTMLElement;
  drawer: HTMLElement;
  dBadge: HTMLElement;
  dBody: HTMLElement;
  dClose: HTMLElement;
  backdrop: HTMLElement;
  dJump: HTMLAnchorElement | null;
} {
  let popover = document.querySelector<HTMLElement>('.footnote-popover');
  let backdrop = document.querySelector<HTMLElement>('.footnote-backdrop');
  let drawer = document.querySelector<HTMLElement>('.footnote-drawer');

  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'footnote-popover';
    popover.setAttribute('role', 'tooltip');
    popover.setAttribute('aria-hidden', 'true');
    popover.hidden = true;
    popover.innerHTML = `
      <div class="footnote-popover-arrow"></div>
      <div class="footnote-popover-header">
        <span class="footnote-popover-badge">#1</span>
        <span class="footnote-popover-label">Footnote</span>
        <button type="button" class="footnote-popover-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="footnote-popover-body"></div>
    `;
    document.body.appendChild(popover);
  }

  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'footnote-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    document.body.appendChild(backdrop);
  }

  if (!drawer) {
    drawer = document.createElement('div');
    drawer.className = 'footnote-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Footnote');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.hidden = true;
    drawer.innerHTML = `
      <div class="footnote-drawer-handle" aria-hidden="true"></div>
      <div class="footnote-drawer-header">
        <div class="footnote-drawer-title-wrap">
          <span class="footnote-drawer-badge">#1</span>
          <h3 class="footnote-drawer-title">Footnote</h3>
        </div>
        <button type="button" class="footnote-drawer-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="footnote-drawer-body"></div>
      <div class="footnote-drawer-footer">
        <a href="#footnote-label" class="footnote-drawer-jump-btn">
          <span>Jump to footnotes</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M7 13l5 5 5-5M12 4v14" />
          </svg>
        </a>
      </div>
    `;
    document.body.appendChild(drawer);
  }

  const arrow = popover.querySelector<HTMLElement>('.footnote-popover-arrow')!;
  const pBadge = popover.querySelector<HTMLElement>('.footnote-popover-badge')!;
  const pBody = popover.querySelector<HTMLElement>('.footnote-popover-body')!;
  const pClose = popover.querySelector<HTMLElement>('.footnote-popover-close')!;

  const dBadge = drawer.querySelector<HTMLElement>('.footnote-drawer-badge')!;
  const dBody = drawer.querySelector<HTMLElement>('.footnote-drawer-body')!;
  const dClose = drawer.querySelector<HTMLElement>('.footnote-drawer-close')!;
  const dJump = drawer.querySelector<HTMLAnchorElement>('.footnote-drawer-jump-btn');

  return { popover, arrow, pBadge, pBody, pClose, drawer, dBadge, dBody, dClose, backdrop, dJump };
}

function getFootnoteContent(ref: HTMLElement): { targetId: string; html: string; indexText: string } | null {
  const href = ref.getAttribute('href') ?? '';
  if (!href.includes('#')) return null;
  const targetId = decodeURIComponent(href.split('#')[1] ?? '');
  if (!targetId) return null;

  const target = document.getElementById(targetId);
  if (!target) return null;

  const clone = target.cloneNode(true) as HTMLElement;
  // 移除回跳链接，避免在浮层或抽屉中重复显示 backref 箭头
  for (const backref of clone.querySelectorAll('.data-footnote-backref, [data-footnote-backref]')) {
    backref.remove();
  }

  const indexText = ref.textContent?.trim() || '1';
  return { targetId, html: clone.innerHTML.trim(), indexText };
}

export function hideFootnotePopover(): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  const popover = document.querySelector<HTMLElement>('.footnote-popover');
  if (!popover || popover.hidden) return;

  popover.classList.remove('visible');
  popover.setAttribute('aria-hidden', 'true');
  activeRef?.classList.remove('is-footnote-active');
  activeRef = null;

  setTimeout(() => {
    if (!popover.classList.contains('visible')) {
      popover.hidden = true;
    }
  }, prefersReducedMotion() ? 0 : 200);
}

export function hideFootnoteDrawer(): void {
  const drawer = document.querySelector<HTMLElement>('.footnote-drawer');
  const backdrop = document.querySelector<HTMLElement>('.footnote-backdrop');
  if (!drawer || drawer.hidden) return;

  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  backdrop?.classList.remove('open');
  backdrop?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('footnote-drawer-open');
  activeRef?.classList.remove('is-footnote-active');
  activeRef = null;

  setTimeout(() => {
    if (!drawer.classList.contains('open')) {
      drawer.hidden = true;
      if (backdrop) backdrop.hidden = true;
    }
  }, prefersReducedMotion() ? 0 : 280);
}

export function showFootnotePopover(ref: HTMLElement): void {
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  const data = getFootnoteContent(ref);
  if (!data) return;

  const { popover, arrow, pBadge, pBody } = ensureElements();
  activeRef?.classList.remove('is-footnote-active');
  activeRef = ref;
  ref.classList.add('is-footnote-active');

  pBadge.textContent = `#${data.indexText}`;
  pBody.innerHTML = data.html;

  popover.hidden = false;
  popover.removeAttribute('hidden');
  popover.setAttribute('aria-hidden', 'false');

  // 计算定位与边缘避让
  const refRect = ref.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const popWidth = Math.min(380, Math.max(260, popRect.width || 320));
  const popHeight = popRect.height || 120;

  const margin = 16;
  const headerOffset = 70; // 顶部工具栏高度
  const spaceAbove = refRect.top - headerOffset;
  const spaceBelow = window.innerHeight - refRect.bottom - margin;

  let placeAbove = true;
  if (spaceAbove < popHeight + 12 && spaceBelow >= popHeight + 12) {
    placeAbove = false;
  }

  let top = placeAbove
    ? (window.scrollY || 0) + refRect.top - popHeight - 10
    : (window.scrollY || 0) + refRect.bottom + 10;

  // 保证顶部不穿透 header
  if (top < (window.scrollY || 0) + headerOffset + 8) {
    top = (window.scrollY || 0) + headerOffset + 8;
  }

  // 水平居中并防溢出
  let left = (window.scrollX || 0) + refRect.left + refRect.width / 2 - popWidth / 2;
  const minLeft = (window.scrollX || 0) + margin;
  const maxLeft = (window.scrollX || 0) + window.innerWidth - popWidth - margin;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  popover.style.width = `${popWidth}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;

  // 调整箭头位置
  popover.classList.toggle('arrow-bottom', placeAbove);
  popover.classList.toggle('arrow-top', !placeAbove);

  const arrowCenter = (window.scrollX || 0) + refRect.left + refRect.width / 2 - left;
  const clampedArrowCenter = Math.max(18, Math.min(popWidth - 18, arrowCenter));
  arrow.style.left = `${Math.round(clampedArrowCenter)}px`;

  // 触发 CSS 过渡
  void popover.offsetWidth;
  popover.classList.add('visible');
}

export function showFootnoteDrawer(ref: HTMLElement): void {
  const data = getFootnoteContent(ref);
  if (!data) return;

  const { drawer, dBadge, dBody, backdrop, dJump } = ensureElements();
  activeRef?.classList.remove('is-footnote-active');
  activeRef = ref;
  ref.classList.add('is-footnote-active');

  dBadge.textContent = `#${data.indexText}`;
  dBody.innerHTML = data.html;

  if (dJump) {
    dJump.setAttribute('href', `#${data.targetId}`);
  }

  backdrop.hidden = false;
  backdrop.removeAttribute('hidden');
  backdrop.setAttribute('aria-hidden', 'false');

  drawer.hidden = false;
  drawer.removeAttribute('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('footnote-drawer-open');

  void drawer.offsetWidth;
  backdrop.classList.add('open');
  drawer.classList.add('open');
}

export function initFootnotes(): void {
  const refs = document.querySelectorAll<HTMLElement>('.markdown-body a[data-footnote-ref], .page-content a[data-footnote-ref]');
  if (refs.length === 0) return;

  const { popover, pClose, drawer, dClose, backdrop, dJump } = ensureElements();

  // 绑定浮窗自身的事件（防止重复绑定）
  if (!popover.dataset.fnBound) {
    popover.dataset.fnBound = '1';
    popover.addEventListener('mouseenter', () => {
      if (closeTimer !== null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    });
    popover.addEventListener('mouseleave', () => {
      closeTimer = setTimeout(() => hideFootnotePopover(), 180);
    });
    pClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideFootnotePopover();
    });
  }

  // 绑定移动端抽屉自身的事件
  if (!drawer.dataset.fnBound) {
    drawer.dataset.fnBound = '1';
    dClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideFootnoteDrawer();
    });
    backdrop?.addEventListener('click', () => {
      hideFootnoteDrawer();
    });
    dJump?.addEventListener('click', (e) => {
      const href = dJump.getAttribute('href');
      if (!href) return;
      hideFootnoteDrawer();
      const target = document.querySelector<HTMLElement>(href);
      if (target) {
        e.preventDefault();
        history.pushState(null, '', href);
        scrollToAnchorOffset(target);
      }
    });
  }

  // 遍历所有正文脚注角标绑定交互
  for (const ref of refs) {
    if (ref.dataset.fnInit === '1') continue;
    ref.dataset.fnInit = '1';

    // 桌面端 hover & focus 交互
    ref.addEventListener('mouseenter', () => {
      if (isMobile()) return;
      showFootnotePopover(ref);
    });

    ref.addEventListener('mouseleave', () => {
      if (isMobile()) return;
      closeTimer = setTimeout(() => hideFootnotePopover(), 200);
    });

    ref.addEventListener('focus', () => {
      if (isMobile()) return;
      showFootnotePopover(ref);
    });

    ref.addEventListener('blur', () => {
      if (isMobile()) return;
      closeTimer = setTimeout(() => hideFootnotePopover(), 200);
    });

    // 点击事件：移动端/触屏打开抽屉，桌面端如果 popover 已打开则允许平滑滚到底部或保持气泡
    ref.addEventListener('click', (e) => {
      if (isMobile()) {
        e.preventDefault();
        e.stopPropagation();
        showFootnoteDrawer(ref);
      } else {
        // 桌面端点击：如果当前 popover 未显示则显示并拦截，已显示则允许跳转
        const popover = document.querySelector<HTMLElement>('.footnote-popover');
        if (!popover || !popover.classList.contains('visible') || activeRef !== ref) {
          e.preventDefault();
          showFootnotePopover(ref);
        }
      }
    });
  }
}

// 全局按键与点击关闭监听
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideFootnotePopover();
    hideFootnoteDrawer();
  }
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (!target.closest('.footnote-popover') && !target.closest('a[data-footnote-ref]')) {
    hideFootnotePopover();
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    if (isMobile()) {
      hideFootnotePopover();
    } else {
      hideFootnoteDrawer();
    }
  });
}

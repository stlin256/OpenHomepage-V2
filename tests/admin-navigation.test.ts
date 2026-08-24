/**
 * 编辑器壳层导航反馈：当前路由必须可见，键盘/读屏用户不依赖 hover 猜测位置。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateSideNav } from '../admin/ui/navigation.ts';

describe('侧栏当前态', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    location.hash = '';
    document.body.innerHTML = `
      <nav>
        <a class="side-item" href="#/page/zh/index.md">Home</a>
        <a class="side-item" href="#/config/editorial">Editorial</a>
        <a class="side-item" href="#/assets">Assets</a>
      </nav>
    `;
  });

  it('标记当前配置路由，并清除上一个路由的标记', () => {
    location.hash = '#/config/editorial';
    updateSideNav();
    const active = document.querySelector('a.active')!;
    expect(active.getAttribute('href')).toBe('#/config/editorial');
    expect(active.getAttribute('aria-current')).toBe('page');

    location.hash = '#/assets';
    updateSideNav();
    expect(document.querySelector('a.active')!.getAttribute('href')).toBe('#/assets');
    expect(document.querySelectorAll('a[aria-current]')).toHaveLength(1);
  });

  it('兼容无斜杠 hash 并在离开时移除 aria-current', () => {
    location.hash = '#config/site';
    document.body.innerHTML = '<a class="side-item" href="#/config/site">Site</a>';
    updateSideNav();
    expect(document.querySelector('a')!.classList.contains('active')).toBe(true);

    location.hash = '#/page/zh/index.md';
    updateSideNav();
    expect(document.querySelectorAll('.active')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(0);
  });
});

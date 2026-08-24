/** 侧栏当前路由标记：hash 是唯一事实源，避免点击后整棵侧栏重绘。 */
export function updateSideNav(root: ParentNode = document): void {
  const current = `#${location.hash.replace(/^#?\/?/, '/')}`;
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a.side-item')) {
    const active = anchor.getAttribute('href') === current;
    anchor.classList.toggle('active', active);
    if (active) anchor.setAttribute('aria-current', 'page');
    else anchor.removeAttribute('aria-current');
  }
}

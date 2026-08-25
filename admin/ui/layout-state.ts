/** 侧栏折叠状态：localStorage 记忆，存储不可用时只当页生效。 */
export const SIDEBAR_KEY = 'oh-admin-sidebar';

export function readSidebarCollapsed(storage: Pick<Storage, 'getItem'> | null): boolean {
  return storage?.getItem(SIDEBAR_KEY) === 'collapsed';
}

export function writeSidebarCollapsed(
  storage: Pick<Storage, 'setItem'> | null,
  collapsed: boolean
): void {
  try {
    storage?.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    /* 存储不可用时保持当前界面状态 */
  }
}

export function applySidebarState(layout: HTMLElement, collapsed: boolean): void {
  layout.classList.toggle('sidebar-collapsed', collapsed);
}

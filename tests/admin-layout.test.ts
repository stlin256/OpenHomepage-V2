/**
 * 编辑器工作区基础布局：侧栏折叠状态持久化、存储异常降级。
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import {
  SIDEBAR_KEY,
  applySidebarState,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from '../admin/ui/layout-state.ts';

describe('编辑器侧栏折叠', () => {
  it('默认展开；collapsed 值可恢复为折叠', () => {
    const storage = {
      getItem: (key: string) => (key === SIDEBAR_KEY ? 'collapsed' : null),
    };
    expect(readSidebarCollapsed(null)).toBe(false);
    expect(readSidebarCollapsed(storage)).toBe(true);
  });

  it('切换时更新布局类并写入本地状态', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const layout = document.createElement('div');

    applySidebarState(layout, true);
    writeSidebarCollapsed(storage, true);
    expect(layout.classList.contains('sidebar-collapsed')).toBe(true);
    expect(values.get(SIDEBAR_KEY)).toBe('collapsed');

    applySidebarState(layout, false);
    writeSidebarCollapsed(storage, false);
    expect(layout.classList.contains('sidebar-collapsed')).toBe(false);
    expect(values.get(SIDEBAR_KEY)).toBe('expanded');
  });

  it('localStorage 不可用时折叠仍当页生效且不抛错', () => {
    const layout = document.createElement('div');
    const denied = {
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => writeSidebarCollapsed(denied, true)).not.toThrow();
    applySidebarState(layout, true);
    expect(layout.classList.contains('sidebar-collapsed')).toBe(true);
  });
});

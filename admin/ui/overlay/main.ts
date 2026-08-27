/**
 * 可视化编辑 overlay 入口（M12a 骨架，docs/specs/12 §2.4）：
 * 顶栏（「编辑模式」标识 + 退出编辑）+ 扫描 [data-oh-src] 建块注册表 + hover 描边高亮。
 * 由渲染页 bootstrap（BaseLayout，OH_EDIT=1 时输出）以经典脚本跨 origin 动态加载；
 * 界面文案走 admin/shared/i18n.ts 字典（与 admin 同一语言记忆）。
 * 后续里程碑在此挂微编辑器/浮动工具条/右侧检查器（M12b+）。
 */
import { createT, detectLang } from '../../shared/i18n.ts';
import { el } from '../dom.ts';
import { scanBlocks, type BlockEntry } from './scanner.ts';

/** hover 描边 class（样式在 overlay.css；outline 不占用布局空间） */
const HOVER_CLASS = 'oh-hover';
/** 编辑模式会话标记（与 BaseLayout bootstrap 同一 key） */
const STORAGE_KEY = 'oh-edit';
/** 与 admin 顶栏同一语言记忆 key */
const LANG_KEY = 'oh-admin-lang';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 顶栏：编辑模式标识 + 退出编辑（清 sessionStorage 标记并刷新，回到纯预览） */
function createTopBar(t: (k: string) => string): HTMLElement {
  const exit = el('button', { class: 'oh-exit', type: 'button' }, t('exitEdit'));
  exit.addEventListener('click', () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage 不可用时直接刷新即可 */
    }
    location.reload();
  });
  return el(
    'div',
    { class: 'oh-topbar', role: 'region', 'aria-label': t('editModeBadge') },
    el('span', { class: 'oh-badge' }, t('editModeBadge')),
    exit,
  );
}

/** hover 描边高亮：mouseover 时给最近的 [data-oh-src] 祖先加 class，移走即清 */
function bindHoverHighlight(doc: Document): void {
  let current: Element | null = null;
  doc.addEventListener('mouseover', (event) => {
    const target = event.target;
    const block = target instanceof Element ? target.closest('[data-oh-src]') : null;
    if (block === current) return;
    current?.classList.remove(HOVER_CLASS);
    current = block;
    current?.classList.add(HOVER_CLASS);
  });
}

/** 初始化 overlay：顶栏 + 块注册表 + hover 描边；返回注册表（后续里程碑复用） */
export function initOverlay(doc: Document): { blocks: BlockEntry[] } {
  const t = createT(detectLang(navigator.language, readStored(LANG_KEY)));
  doc.documentElement.classList.add('oh-editing');
  doc.body.append(createTopBar(t));
  const blocks = scanBlocks(doc);
  bindHoverHighlight(doc);
  return { blocks };
}

// 入口自举：脚本由 bootstrap 动态插入（时序不定），等待 DOM 就绪后初始化
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOverlay(document), { once: true });
  } else {
    initOverlay(document);
  }
}

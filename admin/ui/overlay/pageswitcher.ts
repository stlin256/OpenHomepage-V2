/**
 * 页面切换下拉（M12d，docs/specs/12 §3）：顶栏下拉列出全部页面（标题 + 语言），
 * 当前页高亮；切换 → 跳转该页 previewPath（编辑模式靠 sessionStorage 标记跨页保持，
 * 见 BaseLayout bootstrap——新页面加载后 overlay 自动重新激活）。
 */
import { el } from '../dom.ts';
import type { PageListItem } from './api.ts';

export interface PageSwitcherDeps {
  t: (k: string) => string;
  /** 当前页正文路径（pages/<lang>/<file>，bootstrap 注入；用于高亮当前项） */
  currentSource: string | null;
  loadPages: () => Promise<PageListItem[]>;
  /** 跳转到页面路径（生产为 location.href 赋值；测试注入桩） */
  navigate: (path: string) => void;
}

export interface PageSwitcher {
  el: HTMLElement;
  /** 拉取页面列表并填充选项（失败由调用方兜底，不阻断 overlay） */
  load(): Promise<void>;
}

export function createPageSwitcher(deps: PageSwitcherDeps): PageSwitcher {
  const sel = el('select', {
    class: 'oh-pageswitch',
    'aria-label': deps.t('switchPage'),
    title: deps.t('switchPage'),
  }) as HTMLSelectElement;
  sel.append(el('option', { value: '' }, `${deps.t('switchPage')}…`) as HTMLOptionElement);
  sel.addEventListener('change', () => {
    if (sel.value) deps.navigate(sel.value);
  });

  const load = async (): Promise<void> => {
    const pages = await deps.loadPages();
    sel.replaceChildren(
      ...pages.map((p) => {
        const opt = el(
          'option',
          { value: p.previewPath ?? '' },
          `${p.title || p.file} · ${p.lang}`
        ) as HTMLOptionElement;
        // 当前页高亮（pages/<lang>/<file> 与 bootstrap 注入的 __OH_PAGE_SOURCE__ 对应）
        if (deps.currentSource === `pages/${p.lang}/${p.file}`) opt.selected = true;
        return opt;
      })
    );
  };

  return { el: sel, load };
}

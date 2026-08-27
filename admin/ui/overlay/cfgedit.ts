/**
 * 配置字段就地改字（M12d，docs/specs/12 §2.3/§3）：点击 [data-oh-cfg] 元素 →
 * 原位替换为输入框（单行 input / 多行 textarea）→ Enter（textarea 为 Ctrl+Enter）或
 * 失焦保存（POST /api/config/field，由调用方包 runSave → 成功整页刷新）；Esc 取消还原。
 * 与文本块微编辑器（textedit.ts）同形态：原元素隐藏、编辑框占位在同父级同位置。
 * 编辑初值从服务端配置读取（loadValue）而非取 textContent——页脚等字段的渲染 HTML
 * 与 yaml 原文不同构（内联链接语法），必须以存储值为准。
 */
import { el } from '../dom.ts';
import type { CfgFieldEntry } from './scanner.ts';

/** 多行字段（textarea）：简介/页脚文本；其余（站点标题/昵称/区块标题等）单行 input */
const MULTILINE_PATHS = new Set(['profile.tagline', 'footer.text']);

export function isMultilineCfgPath(path: string): boolean {
  return MULTILINE_PATHS.has(path);
}

export interface CfgEditDeps {
  t: (k: string) => string;
  /** 读取当前存储值（i18n 对象取对应语言，纯字符串原样）；失败抛错（不打开编辑框） */
  loadValue: (path: string, lang: string) => Promise<string>;
  /** 保存（POST /api/config/field）；抛错 = 失败（编辑框保持打开，错误已在顶栏显示） */
  onSave: (path: string, lang: string, value: string) => Promise<void>;
}

export interface CfgEditSession {
  /** 编辑框容器（oh-cfgedit，占位在元素原位置；测试用入口） */
  root: HTMLElement;
  save(): Promise<void>;
  cancel(): void;
}

/** 在字段元素原位置打开编辑框（先异步取存储值，再替换 DOM） */
export async function openCfgEditor(
  entry: CfgFieldEntry,
  deps: CfgEditDeps
): Promise<CfgEditSession> {
  const value = await deps.loadValue(entry.path, entry.lang);
  const target = entry.el as HTMLElement;
  const multiline = isMultilineCfgPath(entry.path);
  const input = multiline
    ? (el('textarea', { class: 'oh-cfgedit-input', rows: '4' }) as HTMLTextAreaElement)
    : (el('input', { type: 'text', class: 'oh-cfgedit-input' }) as HTMLInputElement);
  input.value = value;
  input.setAttribute('aria-label', entry.path);
  const root = el('div', { class: 'oh-cfgedit', role: 'group' }, input);

  target.classList.add('oh-editing-hidden');
  target.parentElement?.insertBefore(root, target);
  input.focus();
  input.select();

  let closed = false;
  let busy = false;
  const teardown = (): void => {
    root.remove();
    target.classList.remove('oh-editing-hidden');
  };
  const cancel = (): void => {
    if (closed || busy) return;
    closed = true;
    teardown();
  };
  const save = async (): Promise<void> => {
    if (closed || busy) return;
    busy = true;
    try {
      await deps.onSave(entry.path, entry.lang, input.value);
      closed = true;
      // 成功路径调用方随即整页刷新（§2.6）；清理兜底保证幂等
      teardown();
    } catch {
      busy = false; // 失败（如校验 400）：编辑框保持打开，可改后重试或 Esc 取消
    }
  };
  // input/textarea 联合类型的 addEventListener 退化出 Event，这里按键盘事件处理
  input.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape') {
      ke.preventDefault();
      ke.stopPropagation(); // 不触发检查器等外层 Esc 处理
      cancel();
    } else if (ke.key === 'Enter' && (multiline ? ke.ctrlKey || ke.metaKey : true)) {
      ke.preventDefault();
      void save();
    }
  });
  // 失焦保存；Esc 取消时 closed 已置位，移除 DOM 触发的 blur 不会再保存
  input.addEventListener('blur', () => {
    if (!closed) void save();
  });

  return { root, save, cancel };
}

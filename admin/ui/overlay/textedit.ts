/**
 * 文本块就地微编辑器（M12b，docs/specs/12 §2.4/§3）：在块原位挂载迷你 Milkdown
 * （仅 commonmark + GFM + history，不带指令节点——指令块由 M12c 检查器负责）。
 * 块 DOM 隐藏、编辑器容器占其位（页面排版样式自然作用于编辑内容）；
 * 完成 / Ctrl+Enter → getMarkdown() 交给调用方 replace（带 hash 防陈旧写）；
 * Esc / 取消 → 不保存还原 DOM。粘贴图片沿用 POST /api/asset 上传 + assets/<name> 引用。
 *
 * 装配模式参考旧全文编辑器（admin/ui/editor/create-editor.ts），但自包含、不 import 它
 * （旧编辑器 M12e 删除）。
 */
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from '@milkdown/prose/keymap';
import { Plugin } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose, getMarkdown } from '@milkdown/utils';
import { el } from '../dom.ts';
import type { BlockEntry } from './scanner.ts';

const historyPlugin = $prose(() => history());
const historyKeys = $prose(() => keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo }));

/** 粘贴图片钩子：上传后把 assets 引用以 image 节点插入（与旧编辑器同一行为） */
function pasteImageHandler(onPasteImage: (file: File) => Promise<string | null>) {
  return $prose(
    () =>
      new Plugin({
        props: {
          handlePaste(view: EditorView, event) {
            const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
              f.type.startsWith('image/')
            );
            if (files.length === 0) return false;
            event.preventDefault();
            void (async () => {
              for (const file of files) {
                const src = await onPasteImage(file);
                if (!src) continue;
                const imageType = view.state.schema.nodes.image;
                const { state, dispatch } = view;
                if (imageType) {
                  dispatch(state.tr.replaceSelectionWith(imageType.create({ src })));
                } else {
                  dispatch(state.tr.insertText(`![](${src})`, state.selection.from));
                }
              }
            })();
            return true;
          },
        },
      })
  );
}

export interface TextEditDeps {
  t: (k: string) => string;
  /** 保存：序列化结果交给调用方（replace 写库）；抛错 = 失败（编辑器保持打开，错误已在顶栏显示） */
  onSave: (markdown: string) => Promise<void>;
  onCancel?: () => void;
  /** 粘贴图片上传：返回 assets/<name> 引用；null = 放弃 */
  onPasteImage?: (file: File) => Promise<string | null>;
}

export interface TextEditSession {
  /** 编辑器容器（oh-textedit，占位在块原位置；测试用入口） */
  root: HTMLElement;
  save(): Promise<void>;
  cancel(): Promise<void>;
}

/** 在块原位置打开微编辑器（entry.markdown 为服务端原文切片） */
export async function openTextEditor(
  entry: BlockEntry,
  deps: TextEditDeps
): Promise<TextEditSession> {
  const { t } = deps;
  const blockEl = entry.el as HTMLElement;
  const host = el('div', { class: 'oh-textedit-host' });
  const doneBtn = el('button', { type: 'button', class: 'oh-primary' }, t('done')) as HTMLButtonElement;
  const cancelBtn = el('button', { type: 'button' }, t('cancel')) as HTMLButtonElement;
  const root = el(
    'div',
    { class: 'oh-textedit', role: 'group', 'aria-label': t('edit') },
    host,
    el('div', { class: 'oh-textedit-ops' }, doneBtn, cancelBtn)
  );

  // 块 DOM 隐藏、编辑器占位（同父级同位置，页面排版样式作用于编辑内容）
  blockEl.classList.add('oh-editing-hidden');
  blockEl.parentElement?.insertBefore(root, blockEl);

  const editor = Editor.make();
  editor
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, entry.markdown ?? '');
    })
    .use(commonmark)
    .use(gfm)
    .use(historyPlugin)
    .use(historyKeys);
  if (deps.onPasteImage) editor.use(pasteImageHandler(deps.onPasteImage));
  await editor.create();
  host.querySelector<HTMLElement>('.ProseMirror')?.focus();

  let closed = false;
  let busy = false;
  const teardown = async (): Promise<void> => {
    await editor.destroy();
    root.remove();
    blockEl.classList.remove('oh-editing-hidden');
  };
  const save = async (): Promise<void> => {
    if (closed || busy) return;
    busy = true;
    try {
      await deps.onSave(editor.action(getMarkdown()));
      closed = true;
      // 成功路径调用方通常随即整页刷新（§2.6）；清理兜底保证幂等
      await teardown();
    } catch {
      busy = false; // 失败（如 hash 陈旧 409）：编辑器保持打开，用户可改后重试或取消
    }
  };
  const cancel = async (): Promise<void> => {
    if (closed || busy) return;
    closed = true;
    await teardown();
    deps.onCancel?.();
  };
  doneBtn.addEventListener('click', () => void save());
  cancelBtn.addEventListener('click', () => void cancel());
  // Ctrl/Cmd+Enter 保存、Esc 取消（capture：先于 ProseMirror 的按键处理）
  root.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void cancel();
      }
    },
    true
  );

  return { root, save, cancel };
}

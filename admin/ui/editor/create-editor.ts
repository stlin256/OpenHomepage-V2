/**
 * Milkdown 编辑器装配：commonmark + GFM + 自定义指令节点 + history。
 * createTestEditor 供 vitest(jsdom) 做解析/序列化往返测试；
 * createEditor 为真实界面（带节点卡片视图与粘贴图片上传）。
 */
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  parserCtx,
  serializerCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { $prose } from '@milkdown/utils';
import { history, undo, redo } from 'prosemirror-history';
import { keymap } from '@milkdown/prose/keymap';
import { Plugin } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { directiveRemark, directiveFallbackRemark, directiveNodes } from './directive-nodes.ts';

export interface EditorHooks {
  /** 文档内容变化（用于自动保存调度） */
  onDocChanged?: () => void;
  /** 粘贴图片：上传后返回图片引用路径（如 assets/x.png），返回 null 表示放弃 */
  onPasteImage?: (file: File) => Promise<string | null>;
}

const historyPlugin = $prose(() => history());
const historyKeys = $prose(() =>
  keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Mod-Shift-z': redo })
);

function changeListener(hooks: EditorHooks) {
  return $prose(
    () =>
      new Plugin({
        view() {
          return {
            update(view: EditorView, prev) {
              if (!view.state.doc.eq(prev.doc)) hooks.onDocChanged?.();
            },
          };
        },
      })
  );
}

function pasteImageHandler(hooks: EditorHooks) {
  return $prose(
    () =>
      new Plugin({
        props: {
          handlePaste(view, event) {
            const files = [...(event.clipboardData?.files ?? [])].filter((f) =>
              f.type.startsWith('image/')
            );
            if (files.length === 0 || !hooks.onPasteImage) return false;
            event.preventDefault();
            void (async () => {
              for (const file of files) {
                const src = await hooks.onPasteImage!(file);
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

/** 装配编辑器；extra 插件（如节点视图）由调用方追加 */
export async function buildEditor(
  root: HTMLElement,
  defaultValue: string,
  hooks: EditorHooks = {},
  extra: unknown[] = []
): Promise<Editor> {
  const editor = Editor.make();
  editor
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
    })
    .use(directiveRemark)
    .use(directiveFallbackRemark)
    .use(commonmark)
    .use(gfm)
    .use(directiveNodes)
    .use(historyPlugin)
    .use(historyKeys)
    .use(changeListener(hooks));
  if (hooks.onPasteImage) editor.use(pasteImageHandler(hooks));
  for (const p of extra) editor.use(p as never);
  await editor.create();
  return editor;
}

/** 测试用：jsdom 环境中的最小编辑器（无节点视图） */
export async function createTestEditor(): Promise<Editor> {
  const root = document.createElement('div');
  return buildEditor(root, '');
}

/** markdown →（解析→序列化）→ markdown，往返校验用 */
export function serializeMarkdown(editor: Editor, markdown: string): string {
  return editor.action((ctx) => {
    const parser = ctx.get(parserCtx);
    const serializer = ctx.get(serializerCtx);
    const doc = parser(markdown);
    if (!doc) throw new Error('解析失败');
    return serializer(doc);
  });
}

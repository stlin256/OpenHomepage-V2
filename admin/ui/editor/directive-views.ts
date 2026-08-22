/**
 * 指令节点的 ProseMirror 节点视图：渲染为带参数表单的占位卡片，
 * 参数修改直接写回节点 attrs（文档变化 → 自动保存 → 序列化为指令语法）。
 */
import { $view } from '@milkdown/utils';
import type { Node } from '@milkdown/prose/model';
import type { EditorView, NodeView, NodeViewConstructor, ViewMutationRecord } from '@milkdown/prose/view';
import { DIRECTIVE_DEFS, directiveAtomNodes, gridNode, gridCellNode } from './directive-nodes.ts';

type T = (key: string) => string;

function paramInput(
  label: string,
  value: string,
  placeholder: string | undefined,
  onInput: (v: string) => void
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'directive-param';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  wrap.append(span, input);
  return wrap;
}

class AtomCardView implements NodeView {
  dom: HTMLElement;
  private node: Node;
  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    defIndex: number
  ) {
    this.node = node;
    const def = DIRECTIVE_DEFS[defIndex];
    this.dom = document.createElement('div');
    this.dom.className = 'directive-card';
    this.dom.contentEditable = 'false';

    const head = document.createElement('div');
    head.className = 'directive-card-head';
    head.textContent = `${def.icon} ${def.name}`;
    this.dom.append(head);

    const body = document.createElement('div');
    body.className = 'directive-card-body';
    for (const p of def.params) {
      body.append(
        paramInput(p.label, String(node.attrs.values[p.key] ?? ''), p.placeholder, (v) =>
          this.updateParam(p.key, v)
        )
      );
    }
    this.dom.append(body);
  }

  private updateParam(key: string, value: string) {
    const pos = this.getPos();
    if (pos === undefined) return;
    const values = { ...this.node.attrs.values, [key]: value };
    if (!value) delete values[key];
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, values })
    );
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    // 外部变更（如撤销）：同步输入框，但不打断正在输入的焦点
    const inputs = this.dom.querySelectorAll<HTMLInputElement>('.directive-param input');
    const def = DIRECTIVE_DEFS.find((d) => d.id === node.type.name)!;
    inputs.forEach((input, i) => {
      const v = String(node.attrs.values[def.params[i].key] ?? '');
      if (document.activeElement !== input && input.value !== v) input.value = v;
    });
    this.node = node;
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof HTMLInputElement;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

class GridView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: Node;
  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    t: T
  ) {
    this.node = node;
    this.dom = document.createElement('div');
    this.dom.className = 'directive-grid-editor';
    const head = document.createElement('div');
    head.className = 'directive-card-head';
    head.contentEditable = 'false';
    head.textContent = `▦ grid`;
    head.append(
      paramInput('cols', String(node.attrs.values.cols ?? '2'), '2', (v) => {
        const pos = this.getPos();
        if (pos === undefined) return;
        const values = { ...this.node.attrs.values, cols: v };
        if (!v) delete values.cols;
        this.view.dispatch(
          this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, values })
        );
      })
    );
    this.dom.append(head);
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'directive-grid-cells';
    this.dom.append(this.contentDOM);
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    return true;
  }

  stopEvent(event: Event): boolean {
    return event.target instanceof HTMLInputElement;
  }

  ignoreMutation(m: ViewMutationRecord): boolean {
    return !this.contentDOM.contains(m.target);
  }
}

class CellView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  constructor() {
    this.dom = document.createElement('div');
    this.dom.className = 'directive-cell-editor';
    this.contentDOM = this.dom;
  }
}

/** 全部指令节点视图（t 用于卡片内文案） */
export function createDirectiveViews(t: T): unknown[] {
  const views = DIRECTIVE_DEFS.map((def, i) =>
    $view(directiveAtomNodes[i].node, (): NodeViewConstructor => {
      return (node, view, getPos) =>
        new AtomCardView(node, view, getPos as () => number | undefined, i);
    })
  );
  views.push(
    $view(gridNode.node, (): NodeViewConstructor => {
      return (node, view, getPos) =>
        new GridView(node, view, getPos as () => number | undefined, t);
    })
  );
  views.push(
    $view(gridCellNode.node, (): NodeViewConstructor => {
      return () => new CellView();
    })
  );
  return views;
}

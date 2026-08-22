/** 极简 DOM 构造工具（无框架，界面保持薄） */

export function el(
  tag: string,
  attrs: Record<string, string | boolean> = {},
  ...children: (Node | string)[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

export function btn(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = el('button', { class: `btn ${className}`.trim(), type: 'button' }, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

export function textInput(
  value: string,
  onInput: (v: string) => void,
  placeholder = ''
): HTMLInputElement {
  const input = el('input', { type: 'text', class: 'input' }) as HTMLInputElement;
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

export function numberInput(
  value: number | undefined,
  onInput: (v: number | undefined) => void
): HTMLInputElement {
  const input = el('input', { type: 'number', class: 'input input-number' }) as HTMLInputElement;
  if (value !== undefined) input.value = String(value);
  input.addEventListener('input', () => {
    onInput(input.value === '' ? undefined : Number(input.value));
  });
  return input;
}

export function checkbox(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

export function select(
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void
): HTMLSelectElement {
  const s = el('select', { class: 'input' }) as HTMLSelectElement;
  for (const o of options) {
    const opt = el('option', { value: o.value }, o.label) as HTMLOptionElement;
    s.append(opt);
  }
  s.value = value;
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), control);
}

/** 可增删排序的列表行编辑器 */
export function listEditor<T>(opts: {
  items: T[];
  renderRow: (item: T, index: number) => HTMLElement;
  onChange: (items: T[]) => void;
  makeNew: () => T;
  addLabel: string;
  t: (k: string) => string;
}): HTMLElement {
  const { items, renderRow, onChange, makeNew, addLabel, t } = opts;
  const wrap = el('div', { class: 'list-editor' });
  const rerender = () => {
    wrap.replaceChildren(...build());
  };
  const build = (): HTMLElement[] => {
    const rows = items.map((item, i) => {
      const row = el('div', { class: 'list-row' }, renderRow(item, i));
      const ops = el(
        'div',
        { class: 'list-ops' },
        btn('↑', () => {
          if (i === 0) return;
          [items[i - 1], items[i]] = [items[i], items[i - 1]];
          onChange(items);
          rerender();
        }),
        btn('↓', () => {
          if (i === items.length - 1) return;
          [items[i + 1], items[i]] = [items[i], items[i + 1]];
          onChange(items);
          rerender();
        }),
        btn(t('remove'), () => {
          items.splice(i, 1);
          onChange(items);
          rerender();
        }, 'btn-danger')
      );
      row.append(ops);
      return row;
    });
    rows.push(
      el('div', { class: 'list-add' },
        btn(addLabel, () => {
          items.push(makeNew());
          onChange(items);
          rerender();
        })) as HTMLElement
    );
    return rows;
  };
  wrap.replaceChildren(...build());
  return wrap;
}

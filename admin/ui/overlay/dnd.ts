/**
 * 块拖拽排序（docs/specs/12 §3 v2 落地项）：hover 工具条的拖拽手柄（⠿，draggable）
 * 发起 HTML5 拖拽，拖拽中途不改任何数据，落下才走 move op（随后整页刷新，既定流程）。
 * - 拖动源：工具条当前块（含 cell——cell 本身是容器块，可在同一 grid 内重排，
 *   也可拖到另一个 grid 或顶层；grid 整体拖拽其内部结构随原文一起移动）；
 * - 落点解析（dragover 实时进行）：指针命中块的上/下半区 → 该块之前/之后边界；
 *   空 grid/cell 容器的中部 → 容器内末尾落点（into，坐标 = 闭围栏行首）；
 *   空容器贴顶/底 10px 内仍算之前/之后，保证边界落点可达；
 * - 指示反馈：合法落点显示插入位置指示线（into 改为高亮容器边框）；
 *   落在源块自身/其内部、overlay 控件或无坐标区域时不 preventDefault
 *   （浏览器呈禁止光标，drop 不会触发）；
 * - 取消：Esc（keydown 显式处理）/ dragend（落下、Esc、拖出窗口都会触发）均清理状态。
 * 键盘可达性由工具条上移/下移按钮保证（M10 原则），拖拽是等价快捷方式。
 * jsdom 无 DragEvent 实现：事件对象只用到 target/clientY/dataTransfer/preventDefault，
 * 测试以 MouseEvent + dataTransfer 桩手工派发。
 */
import { resolveHitTarget, type BlockEntry } from './scanner.ts';

/** 插入位置指示线 class（样式在 overlay.css；pointer-events:none 穿透命中） */
export const DROP_LINE_CLASS = 'oh-drop-line';
/** 拖拽中的源块半透明 class */
export const DRAG_SOURCE_CLASS = 'oh-drag-source';
/** into 落点（空容器内部）的容器高亮 class */
export const DROP_INTO_CLASS = 'oh-drop-into';

/** 解析出的落点：to 为服务端 move 的 to 坐标（块 start/end 或容器闭围栏行首，服务端校验归一化） */
export interface DropTarget {
  to: number;
  /** before/after = 块间水平指示线（锚定该块上/下沿）；into = 高亮容器边框 */
  kind: 'before' | 'after' | 'into';
  /** 指示锚定元素（before/after 的块元素 / into 的容器元素） */
  el: Element;
}

/** 空容器 into 落点 offset：闭围栏行首（块原文切片最后一行的行首，换算为 body 绝对坐标） */
export function containerIntoOffset(entry: BlockEntry): number | null {
  if (entry.kind !== 'containerDirective' || (entry.name !== 'grid' && entry.name !== 'cell')) {
    return null;
  }
  const md = entry.markdown;
  if (md === undefined) return null; // 服务端数据未合并：无法计算内部落点
  return entry.span.start + md.lastIndexOf('\n', md.length - 1) + 1;
}

/** 空容器判定：grid/cell 容器且渲染元素内没有任何子坐标块 */
function isEmptyContainer(entry: BlockEntry): boolean {
  return (
    entry.kind === 'containerDirective' &&
    (entry.name === 'grid' || entry.name === 'cell') &&
    entry.el.querySelector('[data-oh-src]') === null
  );
}

/** 空容器的贴边阈值（px）：贴顶/底 10px 内算之前/之后；元素不高于 20px 时整体算 into */
const EDGE_PX = 10;

/** 指针命中解析落点：上/下半区 → 之前/之后边界；空容器中部 → into 容器内末尾 */
export function resolveDropTarget(entry: BlockEntry, clientY: number): DropTarget {
  const rect = entry.el.getBoundingClientRect();
  if (isEmptyContainer(entry)) {
    const into = containerIntoOffset(entry);
    if (into !== null) {
      const height = rect.bottom - rect.top;
      // 过矮元素（≤20px）边沿区域没有意义，整体算 into；较高的给顶/底各 10px 的之前/之后
      if (height <= EDGE_PX * 2 || (clientY - rect.top > EDGE_PX && rect.bottom - clientY > EDGE_PX)) {
        return { to: into, kind: 'into', el: entry.el };
      }
    }
  }
  const before = clientY < (rect.top + rect.bottom) / 2;
  return { to: before ? entry.span.start : entry.span.end, kind: before ? 'before' : 'after', el: entry.el };
}

export interface DragDeps {
  /** 拖拽手柄（工具条提供；dragstart/dragend 挂在这里） */
  handle: HTMLElement;
  /** 拖动源块（手柄 dragstart 时读取工具条当前块） */
  currentEntry: () => BlockEntry | null;
  /** 命中元素 → 注册表项 */
  entryOf: (el: Element) => BlockEntry | undefined;
  /** 合法落点落下：move 参数（写库与随后整页刷新由调用方负责） */
  onDrop: (entry: BlockEntry, to: number) => void;
}

export interface DragController {
  isDragging(): boolean;
  /** 当前解析出的合法落点（无则 null；测试断言用） */
  activeTarget(): DropTarget | null;
}

/** overlay 自身控件：其上的拖动不解析落点（保持禁止光标） */
const OVERLAY_CHROME =
  '.oh-topbar, .oh-toolbar, .oh-textedit, .oh-cfgedit, .oh-drawer, .oh-drawer-mask, .oh-inspector, .oh-inspector-mask, .oh-drop-line';

/** 绑定块拖拽：手柄 dragstart 发起，document 级 dragover/drop 解析落点，Esc/dragend 取消 */
export function bindBlockDrag(doc: Document, deps: DragDeps): DragController {
  let dragging: BlockEntry | null = null;
  let target: DropTarget | null = null;
  let intoEl: Element | null = null;

  // 插入位置指示线（单例复用，fixed 定位到目标块上/下沿）
  const line = doc.createElement('div');
  line.className = DROP_LINE_CLASS;
  line.hidden = true;
  doc.body.append(line);

  const clearIndicator = (): void => {
    line.hidden = true;
    if (intoEl) {
      intoEl.classList.remove(DROP_INTO_CLASS);
      intoEl = null;
    }
  };

  const showTarget = (next: DropTarget | null): void => {
    target = next;
    clearIndicator();
    if (!next) return;
    if (next.kind === 'into') {
      intoEl = next.el;
      intoEl.classList.add(DROP_INTO_CLASS);
      return;
    }
    const rect = next.el.getBoundingClientRect();
    line.style.top = `${next.kind === 'before' ? rect.top : rect.bottom}px`;
    line.style.left = `${rect.left}px`;
    line.style.width = `${rect.width}px`;
    line.hidden = false;
  };

  const cleanup = (): void => {
    if (dragging) dragging.el.classList.remove(DRAG_SOURCE_CLASS);
    dragging = null;
    showTarget(null);
  };

  deps.handle.addEventListener('dragstart', (event) => {
    const entry = deps.currentEntry();
    if (!entry || !entry.hash) {
      event.preventDefault(); // 无服务端数据：不发起拖拽
      return;
    }
    dragging = entry;
    entry.el.classList.add(DRAG_SOURCE_CLASS);
    const dt = event.dataTransfer;
    if (dt) {
      dt.effectAllowed = 'move';
      try {
        dt.setData('text/plain', ''); // Firefox 要求 setData 才发起拖拽
      } catch {
        /* 测试桩等不支持 setData 时忽略 */
      }
    }
  });

  doc.addEventListener('dragover', (event) => {
    if (!dragging) return;
    const hitEl = event.target;
    let next: DropTarget | null = null;
    if (hitEl instanceof Element && !hitEl.closest(OVERLAY_CHROME)) {
      const hit = resolveHitTarget(hitEl);
      const entry = hit?.type === 'src' ? deps.entryOf(hit.el) : undefined;
      // 源块自身与其内部（含嵌套子孙块）一律非法：自身边界是空操作、内部服务端必拒
      if (entry && !dragging.el.contains(entry.el)) {
        next = resolveDropTarget(entry, event.clientY);
      }
    }
    showTarget(next);
    if (next) {
      event.preventDefault(); // 合法落点：允许落下
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    } else if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'; // 不 preventDefault → 禁止光标，drop 不触发
    }
  });

  doc.addEventListener('drop', (event) => {
    if (!dragging) return; // 外来拖拽（如拖文件）：不接管
    event.preventDefault();
    const entry = dragging;
    const dropped = target;
    cleanup();
    if (dropped) deps.onDrop(entry, dropped.to);
  });

  // dragend 兜底一切结束路径（落下/Esc/拖出窗口）；Esc 另加 keydown 显式取消（中途不改数据）
  deps.handle.addEventListener('dragend', cleanup);
  doc.addEventListener('keydown', (event) => {
    if (dragging && event.key === 'Escape') {
      event.preventDefault();
      cleanup();
    }
  });

  return {
    isDragging: () => dragging !== null,
    activeTarget: () => target,
  };
}

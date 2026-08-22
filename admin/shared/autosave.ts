/**
 * 停顿自动保存调度：编辑触发 touch()，停顿 delayMs 后调一次 save()。
 * 连续编辑合并（debounce）；flush() 立即保存；cancel() 丢弃未保存内容。
 */
export interface Autosave {
  touch(): void;
  flush(): void;
  cancel(): void;
  readonly pending: boolean;
}

export function createAutosave(delayMs: number, save: () => void): Autosave {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    touch() {
      clear();
      timer = setTimeout(() => {
        timer = null;
        save();
      }, delayMs);
    },
    flush() {
      if (timer === null) return;
      clear();
      save();
    },
    cancel() {
      clear();
    },
    get pending() {
      return timer !== null;
    },
  };
}

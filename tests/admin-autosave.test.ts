import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAutosave } from '../admin/shared/autosave.ts';

describe('createAutosave 停顿自动保存', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('停顿 ~1.5s 后触发一次保存', () => {
    const save = vi.fn();
    const a = createAutosave(1500, save);
    a.touch();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.pending).toBe(false);
  });

  it('连续编辑合并为一次保存（debounce）', () => {
    const save = vi.fn();
    const a = createAutosave(1500, save);
    a.touch();
    vi.advanceTimersByTime(1000);
    a.touch();
    vi.advanceTimersByTime(1000);
    a.touch();
    vi.advanceTimersByTime(1500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush 立即保存；cancel 放弃未保存内容', () => {
    const save = vi.fn();
    const a = createAutosave(1500, save);
    a.touch();
    expect(a.pending).toBe(true);
    a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    a.touch();
    a.cancel();
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.pending).toBe(false);
  });
});

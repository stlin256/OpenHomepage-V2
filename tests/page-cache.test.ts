/** 站内页面 HTML 缓存（src/scripts/page-cache.ts）单测：fetch 以 stub 注入。 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPageFetcher } from '../src/scripts/page-cache.ts';

function htmlResponse(html: string, ok = true) {
  return { ok, text: async () => html };
}

describe('page cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功响应缓存：同一路径只请求一次', async () => {
    const fetchMock = vi.fn(async () => htmlResponse('<main>x</main>'));
    vi.stubGlobal('fetch', fetchMock);
    const fetchPage = createPageFetcher(true);
    expect(await fetchPage('/en/')).toBe('<main>x</main>');
    expect(await fetchPage('/en/')).toBe('<main>x</main>');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('并发请求去重：进行中的请求共享同一 Promise', async () => {
    let resolveText: ((v: string) => void) | null = null;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: () =>
        new Promise<string>((r) => {
          resolveText = r;
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const fetchPage = createPageFetcher(true);
    const p1 = fetchPage('/fr/');
    const p2 = fetchPage('/fr/');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // fetch/text 的 await 链在微任务中推进，先让出事件循环再 resolve
    await new Promise((r) => setTimeout(r, 0));
    resolveText!('<main>fr</main>');
    expect(await p1).toBe('<main>fr</main>');
    expect(await p2).toBe('<main>fr</main>');
  });

  it('失败结果不缓存：HTTP 错误与网络异常都会重试', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse('', false))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(htmlResponse('<main>ok</main>'));
    vi.stubGlobal('fetch', fetchMock);
    const fetchPage = createPageFetcher(true);
    expect(await fetchPage('/ja/')).toBeNull();
    expect(await fetchPage('/ja/')).toBeNull();
    expect(await fetchPage('/ja/')).toBe('<main>ok</main>');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('禁用缓存时每次请求都重新抓取', async () => {
    const fetchMock = vi.fn(async () => htmlResponse('<main>dev</main>'));
    vi.stubGlobal('fetch', fetchMock);
    const fetchPage = createPageFetcher(false);
    await fetchPage('/en/');
    await fetchPage('/en/');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

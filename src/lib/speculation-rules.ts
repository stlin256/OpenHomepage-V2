/**
 * 本项目使用自定义 fetch 做站内内容交换，prerender 不会接管点击；
 * prefetch-only 规则只预热 HTTP 缓存，点击路径保持不变。
 */
export function speculationRulesFor(hrefPattern: string): string {
  return JSON.stringify({
    prefetch: [
      {
        source: 'document',
        where: {
          href_matches: hrefPattern,
          relative_to: 'document',
        },
        eagerness: 'moderate',
      },
    ],
  });
}

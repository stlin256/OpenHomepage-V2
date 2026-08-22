/**
 * .embed-lazy（bilibili/youtube）点击加载：
 * 渲染封面占位（youtube 用 i.ytimg.com 缩略图；bilibili 纯色 + 播放按钮，
 * 封面需 API 查询构建期拿不到，决策见 docs/specs/09 实现注记），
 * 点击后替换为 iframe（data-src 由 M2 markdown 管线输出）。
 */
import { embedCoverUrl } from '../lib/interactive.ts';

export function initEmbeds(): void {
  for (const el of document.querySelectorAll<HTMLElement>('.embed-lazy[data-src]')) {
    if (el.dataset.embedInit) continue; // astro:page-load 重复初始化防御
    el.dataset.embedInit = '1';

    const kind = el.dataset.embed === 'youtube' ? 'youtube' : 'bilibili';
    const src = el.dataset.src!;
    const id = kind === 'youtube' ? el.dataset.id : el.dataset.bvid;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'embed-cover';
    btn.setAttribute('aria-label', '加载视频 / Load video');

    const cover = id ? embedCoverUrl(kind, id) : null;
    if (cover) {
      const img = document.createElement('img');
      img.src = cover;
      img.alt = '';
      img.loading = 'lazy';
      btn.appendChild(img);
    }
    const play = document.createElement('span');
    play.className = 'embed-play';
    play.setAttribute('aria-hidden', 'true');
    btn.appendChild(play);

    btn.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.allowFullscreen = true;
      iframe.loading = 'lazy';
      iframe.title = kind === 'bilibili' ? 'bilibili 播放器' : 'YouTube 播放器';
      el.classList.add('embed-loaded');
      el.replaceChildren(iframe);
    });

    el.replaceChildren(btn);
  }
}

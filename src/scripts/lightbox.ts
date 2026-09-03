/**
 * 图片灯箱 2.0（docs/specs/03 §5）：点击正文/网格图片打开全屏预览。
 * - 支持画廊多图顺序翻页、计数器（1 / 4）、上一张/下一张导航按钮；
 * - 键盘方向键（ArrowLeft / ArrowRight）快速切换；
 * - 移动端触摸滑动手势（Swipe Left / Right）流畅切图；
 * - 高分辨率变体按 -full 约定乐观加载，失败逐级回退；
 * - 图注 Caption / Alt 智能展示与防溢出排版；
 * - 关闭：✕ 按钮 / 点击背景 / Esc；开关动画纯 CSS。
 */
import { pickLightboxSrc, fullBad } from "../lib/lightbox.ts";

let galleryImages: HTMLImageElement[] = [];
let currentGalleryIndex = 0;
let touchStartX = 0;
let touchStartY = 0;

function overlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".lightbox");
}

function updateImage(index: number): void {
  const box = overlay();
  const view = box?.querySelector<HTMLImageElement>(".lightbox-img");
  const counter = box?.querySelector<HTMLElement>(".lightbox-counter");
  const caption = box?.querySelector<HTMLElement>(".lightbox-caption");
  const prevBtn = box?.querySelector<HTMLButtonElement>(".lightbox-prev");
  const nextBtn = box?.querySelector<HTMLButtonElement>(".lightbox-next");

  if (!box || !view || galleryImages.length === 0) return;

  currentGalleryIndex = (index + galleryImages.length) % galleryImages.length;
  const img = galleryImages[currentGalleryIndex];
  const pageSrc = img.currentSrc || img.src;
  if (!pageSrc) return;

  const originalSrc = img.dataset.original || null;
  const showCandidate = () => {
    const next = pickLightboxSrc(pageSrc, (url) => !fullBad.has(url), originalSrc);
    view.onerror =
      next === pageSrc
        ? null
        : () => {
            fullBad.add(next);
            showCandidate();
          };
    view.src = next;
  };
  showCandidate();
  view.alt = img.alt || "";

  if (counter) {
    if (galleryImages.length > 1) {
      counter.textContent = `${currentGalleryIndex + 1} / ${galleryImages.length}`;
      counter.hidden = false;
    } else {
      counter.hidden = true;
    }
  }

  if (prevBtn && nextBtn) {
    const showNav = galleryImages.length > 1;
    prevBtn.hidden = !showNav;
    nextBtn.hidden = !showNav;
  }

  if (caption) {
    const figCaption = img.closest("figure")?.querySelector("figcaption")?.textContent?.trim();
    const text = figCaption || img.alt?.trim();
    if (text) {
      caption.textContent = text;
      caption.hidden = false;
    } else {
      caption.hidden = true;
      caption.textContent = "";
    }
  }
}

function openLightbox(img: HTMLImageElement): void {
  const box = overlay();
  if (!box) return;

  const container = img.closest(".md-grid, .page-content, .markdown-body, main") || document.body;
  const rawImgs = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
  galleryImages = rawImgs.filter(
    (i) =>
      i.closest(".markdown-body, .page-content") &&
      !i.closest("a, button, .bgm-drawer, .intro-card, .qr-modal")
  );

  if (galleryImages.length === 0) {
    galleryImages = [img];
    currentGalleryIndex = 0;
  } else {
    currentGalleryIndex = galleryImages.indexOf(img);
    if (currentGalleryIndex === -1) {
      galleryImages.push(img);
      currentGalleryIndex = galleryImages.length - 1;
    }
  }

  updateImage(currentGalleryIndex);

  box.hidden = false;
  void box.offsetWidth;
  box.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeLightbox(box: HTMLElement): void {
  if (box.hidden || box.dataset.closing) return;
  box.dataset.closing = "1";
  box.classList.remove("open");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    box.hidden = true;
    delete box.dataset.closing;
    document.body.style.overflow = "";
    const view = box.querySelector<HTMLImageElement>(".lightbox-img");
    if (view) view.removeAttribute("src");
    galleryImages = [];
  };
  box.addEventListener("transitionend", (e) => {
    if (e.target === box) finish();
  });
  setTimeout(finish, 350);
}

function prevImage(): void {
  if (galleryImages.length <= 1) return;
  updateImage(currentGalleryIndex - 1);
}

function nextImage(): void {
  if (galleryImages.length <= 1) return;
  updateImage(currentGalleryIndex + 1);
}

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const box = overlay();

  if (box && !box.hidden) {
    if (target.closest(".lightbox-prev")) {
      e.preventDefault();
      e.stopPropagation();
      prevImage();
      return;
    }
    if (target.closest(".lightbox-next")) {
      e.preventDefault();
      e.stopPropagation();
      nextImage();
      return;
    }
    if (target.closest(".lightbox-close") || target === box || target.classList.contains("lightbox-figure")) {
      e.preventDefault();
      closeLightbox(box);
      return;
    }
    return;
  }

  const img = target.closest?.("img");
  if (!(img instanceof HTMLImageElement)) return;
  if (!img.closest(".markdown-body, .page-content")) return;
  if (img.closest("a, button, .bgm-drawer, .intro-card, .qr-modal")) return;
  openLightbox(img);
});

document.addEventListener("keydown", (e) => {
  const box = overlay();
  if (!box || box.hidden) return;

  if (e.key === "Escape") {
    closeLightbox(box);
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    prevImage();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    nextImage();
  }
});

document.addEventListener(
  "touchstart",
  (e) => {
    const box = overlay();
    if (!box || box.hidden) return;
    touchStartX = e.changedTouches[0]?.screenX ?? 0;
    touchStartY = e.changedTouches[0]?.screenY ?? 0;
  },
  { passive: true }
);

document.addEventListener(
  "touchend",
  (e) => {
    const box = overlay();
    if (!box || box.hidden) return;
    const endX = e.changedTouches[0]?.screenX ?? 0;
    const endY = e.changedTouches[0]?.screenY ?? 0;
    const dx = endX - touchStartX;
    const dy = endY - touchStartY;

    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) {
        prevImage();
      } else {
        nextImage();
      }
    }
  },
  { passive: true }
);

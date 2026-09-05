/**
 * 多语言内容同步与缺译看板（i18n Sync Assistant）：
 * 1. 全局页面多语言矩阵（按 Slug 分组，展示各语言是否存在独立文件 / 使用回退）；
 * 2. 统计覆盖率仪表；
 * 3. 缺译项支持一键「克隆骨架」：保留 Frontmatter 结构与自定义指令，自动创建目标语言模板。
 */
import { el, btn } from "../dom.ts";
import { api, type PageMeta } from "../api.ts";
import { generatePageSkeleton } from "../../shared/skeleton.ts";
import type { AppState } from "../main.ts";

export async function renderI18nSync(
  container: HTMLElement,
  state: AppState
): Promise<() => void> {
  const t = state.t;
  const { pages } = await api.pages();

  const slugs = [...new Set(pages.map((p) => p.slug || (p.file.replace(/\.md$/, "") === "index" ? "/" : p.file.replace(/\.md$/, ""))))];
  const siteLangs = [...new Set(pages.map((p) => p.lang))].sort();

  // 统计覆盖率
  const totalSlots = slugs.length * siteLangs.length;
  const readySlots = pages.length;
  const coveragePercent = totalSlots > 0 ? Math.round((readySlots / totalSlots) * 100) : 100;

  // 仪表卡片
  const statsBar = el(
    "div",
    { class: "i18n-stats-bar" },
    el(
      "div",
      { class: "i18n-stat-card" },
      el("span", { class: "i18n-stat-label" }, t("i18nTotalPages")),
      el("span", { class: "i18n-stat-value" }, String(slugs.length))
    ),
    el(
      "div",
      { class: "i18n-stat-card" },
      el("span", { class: "i18n-stat-label" }, t("i18nCoverage")),
      el("span", { class: "i18n-stat-value" }, `${coveragePercent}%`)
    )
  );

  // 矩阵表格
  const table = el("table", { class: "i18n-matrix-table" });
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(el("th", { class: "col-slug" }, t("i18nColPage")));
  for (const lang of siteLangs) {
    headRow.append(el("th", { class: "col-lang" }, lang.toUpperCase()));
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = el("tbody");

  const reloadView = async () => {
    await state.refreshSidebar();
    await renderI18nSync(container, state);
  };

  const handleCloneSkeleton = async (targetLang: string, targetSlug: string, sourceMeta: PageMeta) => {
    state.setStatus(t("saving"));
    try {
      const source = await api.page(sourceMeta.lang, sourceMeta.file);
      const skeletonBody = generatePageSkeleton(source.body);
      const title = String(source.frontmatter.title || targetSlug);
      await api.createPage(targetLang, `${title} [待翻译]`, targetSlug, skeletonBody);
      state.setStatus(t("skeletonCloned"), "ok");
      await reloadView();
    } catch (e) {
      state.setStatus(`${t("saveFailed")}: ${(e as Error).message}`, "err");
    }
  };

  for (const slug of slugs) {
    const row = el("tr");
    const slugPages = pages.filter((p) => (p.slug || (p.file.replace(/\.md$/, "") === "index" ? "/" : p.file.replace(/\.md$/, ""))) === slug);
    const sourcePage = slugPages[0];

    const slugCell = el("td", { class: "cell-slug" });
    slugCell.append(
      el("div", { class: "slug-title" }, sourcePage?.title || slug),
      el("div", { class: "slug-path muted" }, slug)
    );
    row.append(slugCell);

    for (const lang of siteLangs) {
      const pageMatch = slugPages.find((p) => p.lang === lang);
      const cell = el("td", { class: "cell-status" });

      if (pageMatch) {
        const badge = el(
          "a",
          { class: "i18n-badge ready", href: `#/page/${pageMatch.lang}/${pageMatch.file}` },
          `✓ ${t("i18nStatusReady")}`
        );
        cell.append(badge);
      } else {
        const badge = el("span", { class: "i18n-badge fallback" }, `⚠ ${t("i18nStatusFallback")}`);
        const cloneBtn = btn(
          `⚡ ${t("cloneSkeleton")}`,
          () => void handleCloneSkeleton(lang, slug, sourcePage),
          "btn-sm btn-clone"
        );
        cell.append(badge, cloneBtn);
      }
      row.append(cell);
    }
    tbody.append(row);
  }
  table.append(tbody);

  const wrapper = el(
    "div",
    { class: "i18n-sync-view" },
    el("div", { class: "view-header" }, el("h2", {}, t("i18nSyncTitle")), el("p", { class: "muted" }, t("i18nSyncDesc"))),
    statsBar,
    el("div", { class: "i18n-table-wrap" }, table)
  );

  container.replaceChildren(wrapper);
  return () => {};
}

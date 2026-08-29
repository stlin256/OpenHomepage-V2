/**
 * UI 文案 i18n 字典（zh / en / ja / fr）：站点内置的界面文案集中管理，
 * 供构建侧组件与浏览器侧脚本共用。无 Node 依赖。
 *
 * 语言列表与 data/pages/<lang> 目录一致：zh、en、ja、fr。
 * 缺失语言回退到 en，再缺失回退到首个可用语言。
 */

/** 站点内置 UI 支持的语言码（与 data.example/pages 子目录一致） */
export const UI_LANGS = ['zh', 'en', 'ja', 'fr'] as const;
export type UiLang = (typeof UI_LANGS)[number];

/** 归一化语言码为主语言子标签，并校验是否在 UI_LANGS 中；非法返回 'en' */
export function normalizeUiLang(lang: string | null | undefined): UiLang {
  const code = (lang ?? '').toLowerCase().split(/[-_]/)[0];
  return (UI_LANGS as readonly string[]).includes(code) ? (code as UiLang) : 'en';
}

/** 顶栏工具区按钮 aria-label 等 */
export interface HeaderLabels {
  navToggle: string;
  siteNav: string;
  search: string;
  bgmToggle: string;
  langSwitch: string;
  themeToggle: string;
}

/** BGM 抽屉 */
export interface BgmLabels {
  drawerTitle: string;
  close: string;
  prev: string;
  playPause: string;
  next: string;
  volume: string;
  trackFallback: string;
}

/** 灯箱 */
export interface LightboxLabels {
  dialog: string;
  close: string;
}

/** 联系卡 / 二维码弹窗 */
export interface ContactCardLabels {
  close: string;
  qrClose: string;
}

/** 流式区块 */
export interface StreamLabels {
  replay: string;
}

/** 音频播放器 */
export interface AudioLabels {
  play: string;
  defaultTitle: string;
  timeFallback: string;
  coverAltFallback: string;
}

/** 嵌入播放器 */
export interface EmbedLabels {
  bilibiliTitleFallback: string;
  youtubeTitleFallback: string;
  bilibiliPlay: string;
  youtubePlay: string;
  bilibiliBadge: string;
  youtubeBadge: string;
}

/** 指令占位卡（编辑模式） */
export interface DirectiveLabels {
  missingParams: (name: string) => string;
  unknown: (name: string) => string;
}

/** 目录 */
export interface TocLabels {
  title: string;
}

/** 学术成果 */
export interface PublicationsLabels {
  abstract: string;
  copyBibtex: string;
  empty: string;
  linksAria: string;
}

/** 统一 UI 文案集合 */
export interface UiLabels {
  header: HeaderLabels;
  bgm: BgmLabels;
  lightbox: LightboxLabels;
  contactCard: ContactCardLabels;
  stream: StreamLabels;
  audio: AudioLabels;
  embed: EmbedLabels;
  directive: DirectiveLabels;
  toc: TocLabels;
  publications: PublicationsLabels;
}

export const UI_LABELS: Record<UiLang, UiLabels> = {
  zh: {
    header: {
      navToggle: '打开导航菜单',
      siteNav: '站点导航',
      search: '搜索 (Ctrl+K)',
      bgmToggle: '播放/暂停背景音乐',
      langSwitch: '语言切换',
      themeToggle: '切换亮色/暗色主题',
    },
    bgm: {
      drawerTitle: 'Playlist · 背景音乐',
      close: '关闭',
      prev: '上一首',
      playPause: '播放/暂停',
      next: '下一首',
      volume: '音量调节',
      trackFallback: '曲目 1',
    },
    lightbox: { dialog: '图片预览', close: '关闭' },
    contactCard: { close: '关闭联系卡', qrClose: '关闭' },
    stream: { replay: '重播' },
    audio: {
      play: '播放',
      defaultTitle: '音频播放',
      timeFallback: '--:-- / --:--',
      coverAltFallback: '封面',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili 视频',
      youtubeTitleFallback: 'YouTube 视频',
      bilibiliPlay: '播放 bilibili 视频',
      youtubePlay: '播放 YouTube 视频',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name) => `${name}：缺少参数，点击配置`,
      unknown: (name) => `未知指令 ${name}`,
    },
    toc: { title: '文章目录' },
    publications: {
      abstract: '摘要',
      copyBibtex: '复制 BibTeX',
      empty: '没有匹配的成果',
      linksAria: '论文链接',
    },
  },
  en: {
    header: {
      navToggle: 'Open navigation menu',
      siteNav: 'Site navigation',
      search: 'Search (Ctrl+K)',
      bgmToggle: 'Toggle background music',
      langSwitch: 'Switch language',
      themeToggle: 'Toggle light/dark theme',
    },
    bgm: {
      drawerTitle: 'Playlist · Background music',
      close: 'Close',
      prev: 'Previous',
      playPause: 'Play/Pause',
      next: 'Next',
      volume: 'Volume',
      trackFallback: 'Track 1',
    },
    lightbox: { dialog: 'Image preview', close: 'Close' },
    contactCard: { close: 'Close contact card', qrClose: 'Close' },
    stream: { replay: 'Replay' },
    audio: {
      play: 'Play',
      defaultTitle: 'Audio player',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Cover',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili video',
      youtubeTitleFallback: 'YouTube video',
      bilibiliPlay: 'Play bilibili video',
      youtubePlay: 'Play YouTube video',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name) => `${name}: missing params, click to configure`,
      unknown: (name) => `Unknown directive: ${name}`,
    },
    toc: { title: 'Contents' },
    publications: {
      abstract: 'Abstract',
      copyBibtex: 'Copy BibTeX',
      empty: 'No publications matched',
      linksAria: 'Publication links',
    },
  },
  ja: {
    header: {
      navToggle: 'ナビゲーションメニューを開く',
      siteNav: 'サイトナビゲーション',
      search: '検索 (Ctrl+K)',
      bgmToggle: 'BGM の再生/一時停止',
      langSwitch: '言語切替',
      themeToggle: 'テーマ切替',
    },
    bgm: {
      drawerTitle: 'プレイリスト · BGM',
      close: '閉じる',
      prev: '前の曲',
      playPause: '再生/一時停止',
      next: '次の曲',
      volume: '音量',
      trackFallback: 'トラック 1',
    },
    lightbox: { dialog: '画像プレビュー', close: '閉じる' },
    contactCard: { close: '連絡カードを閉じる', qrClose: '閉じる' },
    stream: { replay: 'リプレイ' },
    audio: {
      play: '再生',
      defaultTitle: 'オーディオプレーヤー',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'カバー',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili 動画',
      youtubeTitleFallback: 'YouTube 動画',
      bilibiliPlay: 'bilibili 動画を再生',
      youtubePlay: 'YouTube 動画を再生',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name) => `${name}: パラメータ不足、クリックして設定`,
      unknown: (name) => `不明なディレクティブ: ${name}`,
    },
    toc: { title: '目次' },
    publications: {
      abstract: '概要',
      copyBibtex: 'BibTeX をコピー',
      empty: '一致する成果がありません',
      linksAria: '論文リンク',
    },
  },
  fr: {
    header: {
      navToggle: 'Ouvrir le menu de navigation',
      siteNav: 'Navigation du site',
      search: 'Rechercher (Ctrl+K)',
      bgmToggle: 'Activer/désactiver la musique de fond',
      langSwitch: 'Changer de langue',
      themeToggle: 'Basculer le thème clair/sombre',
    },
    bgm: {
      drawerTitle: 'Playlist · Musique de fond',
      close: 'Fermer',
      prev: 'Précédent',
      playPause: 'Lecture/Pause',
      next: 'Suivant',
      volume: 'Volume',
      trackFallback: 'Piste 1',
    },
    lightbox: { dialog: 'Aperçu de l’image', close: 'Fermer' },
    contactCard: { close: 'Fermer la carte de contact', qrClose: 'Fermer' },
    stream: { replay: 'Rejouer' },
    audio: {
      play: 'Lecture',
      defaultTitle: 'Lecteur audio',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Pochette',
    },
    embed: {
      bilibiliTitleFallback: 'Vidéo bilibili',
      youtubeTitleFallback: 'Vidéo YouTube',
      bilibiliPlay: 'Lire la vidéo bilibili',
      youtubePlay: 'Lire la vidéo YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name) => `${name} : paramètres manquants, cliquer pour configurer`,
      unknown: (name) => `Directive inconnue : ${name}`,
    },
    toc: { title: 'Sommaire' },
    publications: {
      abstract: 'Résumé',
      copyBibtex: 'Copier BibTeX',
      empty: 'Aucune publication ne correspond',
      linksAria: 'Liens de la publication',
    },
  },
};

/** 按语言码取 UI 文案集合；非法/缺失回退 en */
export function getUiLabels(lang: string | null | undefined): UiLabels {
  return UI_LABELS[normalizeUiLang(lang)];
}

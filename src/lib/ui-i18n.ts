/**
 * UI 文案 i18n 字典（zh / en / ja / fr）：站点内置的界面文案集中管理，
 * 供构建侧组件与浏览器侧脚本共用。无 Node 依赖。
 *
 * 语言列表与 data/pages/<lang> 目录一致：zh、en、ja、fr。
 * 缺失语言回退到 en，再缺失回退到首个可用语言。
 */

/** 站点内置 UI 支持的语言码（与 data.example/pages 子目录一致） */
export const UI_LANGS = ['zh', 'en', 'ja', 'fr', 'de', 'es', 'ko', 'pt', 'ru', 'it', 'nl', 'tr', 'vi', 'th', 'id', 'ar', 'hi'] as const;
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


/** 代码块 */
export interface CodeLabels {
  copy: string;
  copied: string;
}
/** 富媒体脚注 */
export interface FootnotesLabels {
  title: string;
  label: string;
  backToRef: (refIndex: number) => string;
  close: string;
  jumpToBottom: string;
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
  footnotes: FootnotesLabels;
  code: CodeLabels;
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
    footnotes: {
      title: '脚注',
      label: '脚注',
      backToRef: (n: number) => '返回引用 ' + n,
      close: '关闭',
      jumpToBottom: '查看文末脚注',
    },
    code: { copy: '复制代码', copied: '已复制' },
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
    footnotes: {
      title: 'Footnotes',
      label: 'Footnotes',
      backToRef: (n: number) => 'Back to reference ' + n,
      close: 'Close',
      jumpToBottom: 'Jump to footnotes',
    },
    code: { copy: 'Copy code', copied: 'Copied' },
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
    footnotes: {
      title: '脚注',
      label: '脚注',
      backToRef: (n: number) => '参照 ' + n + ' に戻る',
      close: '閉じる',
      jumpToBottom: '脚注へ移動',
    },
    code: { copy: 'コピー', copied: 'コピー完了' },
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
    footnotes: {
      title: 'Notes de bas de page',
      label: 'Notes de bas de page',
      backToRef: (n: number) => 'Retour à la référence ' + n,
      close: 'Fermer',
      jumpToBottom: 'Aller aux notes de bas de page',
    },
    code: { copy: 'Copier', copied: 'Copié' },
  },
  de: {
    header: {
      navToggle: 'Navigationsmenü öffnen',
      siteNav: 'Seitennavigation',
      search: 'Suchen (Strg+K)',
      bgmToggle: 'Hintergrundmusik umschalten',
      langSwitch: 'Sprache wechseln',
      themeToggle: 'Hell/Dunkel-Design umschalten',
    },
    bgm: {
      drawerTitle: 'Playlist · Hintergrundmusik',
      close: 'Schließen',
      prev: 'Vorheriger',
      playPause: 'Wiedergabe/Pause',
      next: 'Weiter',
      volume: 'Lautstärke',
      trackFallback: 'Titel 1',
    },
    lightbox: { dialog: 'Bildvorschau', close: 'Schließen' },
    contactCard: { close: 'Kontakt schließen', qrClose: 'Schließen' },
    stream: { replay: 'Erneut abspielen' },
    audio: {
      play: 'Wiedergabe',
      defaultTitle: 'Audio-Player',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Cover',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili-Video',
      youtubeTitleFallback: 'YouTube-Video',
      bilibiliPlay: 'bilibili-Video abspielen',
      youtubePlay: 'YouTube-Video abspielen',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: Parameter fehlen, zum Konfigurieren klicken`,
      unknown: (name: string) => `Unbekannte Anweisung: ${name}`,
    },
    toc: { title: 'Inhaltsverzeichnis' },
    publications: {
      abstract: 'Zusammenfassung',
      copyBibtex: 'BibTeX kopieren',
      empty: 'Keine passenden Publikationen',
      linksAria: 'Publikationslinks',
    },
    footnotes: {
      title: 'Fußnoten',
      label: 'Fußnoten',
      backToRef: (n: number) => 'Zurück zu Referenz ' + n,
      close: 'Schließen',
      jumpToBottom: 'Zu den Fußnoten springen',
    },
    code: { copy: 'Kopieren', copied: 'Kopiert' },
  },
  es: {
    header: {
      navToggle: 'Abrir menú de navegación',
      siteNav: 'Navegación del sitio',
      search: 'Buscar (Ctrl+K)',
      bgmToggle: 'Activar/desactivar música de fondo',
      langSwitch: 'Cambiar idioma',
      themeToggle: 'Cambiar tema claro/oscuro',
    },
    bgm: {
      drawerTitle: 'Playlist · Música de fondo',
      close: 'Cerrar',
      prev: 'Anterior',
      playPause: 'Reproducir/Pausar',
      next: 'Siguiente',
      volume: 'Volumen',
      trackFallback: 'Pista 1',
    },
    lightbox: { dialog: 'Vista previa de imagen', close: 'Cerrar' },
    contactCard: { close: 'Cerrar tarjeta de contacto', qrClose: 'Cerrar' },
    stream: { replay: 'Reproducir de nuevo' },
    audio: {
      play: 'Reproducir',
      defaultTitle: 'Reproductor de audio',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Portada',
    },
    embed: {
      bilibiliTitleFallback: 'Vídeo de bilibili',
      youtubeTitleFallback: 'Vídeo de YouTube',
      bilibiliPlay: 'Reproducir vídeo de bilibili',
      youtubePlay: 'Reproducir vídeo de YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: faltan parámetros, clic para configurar`,
      unknown: (name: string) => `Directiva desconocida: ${name}`,
    },
    toc: { title: 'Contenido' },
    publications: {
      abstract: 'Resumen',
      copyBibtex: 'Copiar BibTeX',
      empty: 'Ninguna publicación coincide',
      linksAria: 'Enlaces de publicación',
    },
    footnotes: {
      title: 'Notas al pie',
      label: 'Notas al pie',
      backToRef: (n: number) => 'Volver a la referencia ' + n,
      close: 'Cerrar',
      jumpToBottom: 'Ir a las notas al pie',
    },
    code: { copy: 'Copiar', copied: 'Copiado' },
  },
  ko: {
    header: {
      navToggle: '탐색 메뉴 열기',
      siteNav: '사이트 탐색',
      search: '검색 (Ctrl+K)',
      bgmToggle: '배경음악 재생/일시정지',
      langSwitch: '언어 전환',
      themeToggle: '밝은/어두운 테마 전환',
    },
    bgm: {
      drawerTitle: 'Playlist · 배경음악',
      close: '닫기',
      prev: '이전',
      playPause: '재생/일시정지',
      next: '다음',
      volume: '음량',
      trackFallback: '트랙 1',
    },
    lightbox: { dialog: '이미지 미리보기', close: '닫기' },
    contactCard: { close: '연락처 카드 닫기', qrClose: '닫기' },
    stream: { replay: '다시 재생' },
    audio: {
      play: '재생',
      defaultTitle: '오디오 플레이어',
      timeFallback: '--:-- / --:--',
      coverAltFallback: '표지',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili 영상',
      youtubeTitleFallback: 'YouTube 영상',
      bilibiliPlay: 'bilibili 영상 재생',
      youtubePlay: 'YouTube 영상 재생',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: 매개변수 누락, 클릭하여 설정`,
      unknown: (name: string) => `알 수 없는 지시어: ${name}`,
    },
    toc: { title: '목차' },
    publications: {
      abstract: '요약',
      copyBibtex: 'BibTeX 복사',
      empty: '일치하는 출판물이 없습니다',
      linksAria: '출판물 링크',
    },
    footnotes: {
      title: '각주',
      label: '각주',
      backToRef: (n: number) => '참조 ' + n + '로 돌아가기',
      close: '닫기',
      jumpToBottom: '각주로 이동',
    },
    code: { copy: '코드 복사', copied: '복사됨' },
  },
  pt: {
    header: {
      navToggle: 'Abrir menu de navegação',
      siteNav: 'Navegação do site',
      search: 'Pesquisar (Ctrl+K)',
      bgmToggle: 'Ativar/desativar música de fundo',
      langSwitch: 'Mudar idioma',
      themeToggle: 'Alternar tema claro/escuro',
    },
    bgm: {
      drawerTitle: 'Playlist · Música de fundo',
      close: 'Fechar',
      prev: 'Anterior',
      playPause: 'Reproduzir/Pausar',
      next: 'Próximo',
      volume: 'Volume',
      trackFallback: 'Faixa 1',
    },
    lightbox: { dialog: 'Pré-visualização de imagem', close: 'Fechar' },
    contactCard: { close: 'Fechar cartão de contato', qrClose: 'Fechar' },
    stream: { replay: 'Reproduzir novamente' },
    audio: {
      play: 'Reproduzir',
      defaultTitle: 'Reprodutor de áudio',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Capa',
    },
    embed: {
      bilibiliTitleFallback: 'Vídeo do bilibili',
      youtubeTitleFallback: 'Vídeo do YouTube',
      bilibiliPlay: 'Reproduzir vídeo do bilibili',
      youtubePlay: 'Reproduzir vídeo do YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: parâmetros ausentes, clique para configurar`,
      unknown: (name: string) => `Diretiva desconhecida: ${name}`,
    },
    toc: { title: 'Conteúdo' },
    publications: {
      abstract: 'Resumo',
      copyBibtex: 'Copiar BibTeX',
      empty: 'Nenhuma publicação correspondente',
      linksAria: 'Links da publicação',
    },
    footnotes: {
      title: 'Notas de rodapé',
      label: 'Notas de rodapé',
      backToRef: (n: number) => 'Voltar para a referência ' + n,
      close: 'Fechar',
      jumpToBottom: 'Ir para as notas de rodapé',
    },
    code: { copy: 'Copiar', copied: 'Copiado' },
  },
  ru: {
    header: {
      navToggle: 'Открыть меню навигации',
      siteNav: 'Навигация по сайту',
      search: 'Поиск (Ctrl+K)',
      bgmToggle: 'Включить/выключить фоновую музыку',
      langSwitch: 'Сменить язык',
      themeToggle: 'Переключить светлую/тёмную тему',
    },
    bgm: {
      drawerTitle: 'Playlist · Фоновая музыка',
      close: 'Закрыть',
      prev: 'Предыдущий',
      playPause: 'Воспр./Пауза',
      next: 'Следующий',
      volume: 'Громкость',
      trackFallback: 'Дорожка 1',
    },
    lightbox: { dialog: 'Просмотр изображения', close: 'Закрыть' },
    contactCard: { close: 'Закрыть контактную карту', qrClose: 'Закрыть' },
    stream: { replay: 'Повторить' },
    audio: {
      play: 'Воспр.',
      defaultTitle: 'Аудиоплеер',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Обложка',
    },
    embed: {
      bilibiliTitleFallback: 'Видео bilibili',
      youtubeTitleFallback: 'Видео YouTube',
      bilibiliPlay: 'Воспроизвести видео bilibili',
      youtubePlay: 'Воспроизвести видео YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: нет параметров, нажмите для настройки`,
      unknown: (name: string) => `Неизвестная директива: ${name}`,
    },
    toc: { title: 'Содержание' },
    publications: {
      abstract: 'Аннотация',
      copyBibtex: 'Копировать BibTeX',
      empty: 'Нет соответствующих публикаций',
      linksAria: 'Ссылки на публикации',
    },
    footnotes: {
      title: 'Сноски',
      label: 'Сноски',
      backToRef: (n: number) => 'Назад к ссылке ' + n,
      close: 'Закрыть',
      jumpToBottom: 'Перейти к сноскам',
    },
    code: { copy: 'Копировать', copied: 'Скопировано' },
  },
  it: {
    header: {
      navToggle: 'Apri menu di navigazione',
      siteNav: 'Navigazione del sito',
      search: 'Cerca (Ctrl+K)',
      bgmToggle: 'Attiva/disattiva musica di sottofondo',
      langSwitch: 'Cambia lingua',
      themeToggle: 'Cambia tema chiaro/scuro',
    },
    bgm: {
      drawerTitle: 'Playlist · Musica di sottofondo',
      close: 'Chiudi',
      prev: 'Precedente',
      playPause: 'Riproduci/Pausa',
      next: 'Successivo',
      volume: 'Volume',
      trackFallback: 'Traccia 1',
    },
    lightbox: { dialog: 'Anteprima immagine', close: 'Chiudi' },
    contactCard: { close: 'Chiudi scheda di contatto', qrClose: 'Chiudi' },
    stream: { replay: 'Riproduci di nuovo' },
    audio: {
      play: 'Riproduci',
      defaultTitle: 'Lettore audio',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Copertina',
    },
    embed: {
      bilibiliTitleFallback: 'Video bilibili',
      youtubeTitleFallback: 'Video YouTube',
      bilibiliPlay: 'Riproduci video bilibili',
      youtubePlay: 'Riproduci video YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: parametri mancanti, clicca per configurare`,
      unknown: (name: string) => `Direttiva sconosciuta: ${name}`,
    },
    toc: { title: 'Indice' },
    publications: {
      abstract: 'Riassunto',
      copyBibtex: 'Copia BibTeX',
      empty: 'Nessuna pubblicazione corrispondente',
      linksAria: 'Collegamenti della pubblicazione',
    },
    footnotes: {
      title: 'Note a piè di pagina',
      label: 'Note a piè di pagina',
      backToRef: (n: number) => 'Torna al riferimento ' + n,
      close: 'Chiudi',
      jumpToBottom: 'Vai alle note a piè di pagina',
    },
    code: { copy: 'Copia', copied: 'Copiato' },
  },
  nl: {
    header: {
      navToggle: 'Navigatiemenu openen',
      siteNav: 'Sitenavigatie',
      search: 'Zoeken (Ctrl+K)',
      bgmToggle: 'Achtergrondmuziek in-/uitschakelen',
      langSwitch: 'Taal wijzigen',
      themeToggle: 'Licht/donker thema wisselen',
    },
    bgm: {
      drawerTitle: 'Playlist · Achtergrondmuziek',
      close: 'Sluiten',
      prev: 'Vorige',
      playPause: 'Afspelen/Pauze',
      next: 'Volgende',
      volume: 'Volume',
      trackFallback: 'Nummer 1',
    },
    lightbox: { dialog: 'Afbeelding voorbeeld', close: 'Sluiten' },
    contactCard: { close: 'Contactkaart sluiten', qrClose: 'Sluiten' },
    stream: { replay: 'Opnieuw afspelen' },
    audio: {
      play: 'Afspelen',
      defaultTitle: 'Audiospeler',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Hoes',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili-video',
      youtubeTitleFallback: 'YouTube-video',
      bilibiliPlay: 'bilibili-video afspelen',
      youtubePlay: 'YouTube-video afspelen',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: ontbrekende parameters, klik om te configureren`,
      unknown: (name: string) => `Onbekende instructie: ${name}`,
    },
    toc: { title: 'Inhoud' },
    publications: {
      abstract: 'Samenvatting',
      copyBibtex: 'BibTeX kopiëren',
      empty: 'Geen overeenkomende publicaties',
      linksAria: 'Publicatielinks',
    },
    footnotes: {
      title: 'Voetnoten',
      label: 'Voetnoten',
      backToRef: (n: number) => 'Terug naar referentie ' + n,
      close: 'Sluiten',
      jumpToBottom: 'Naar voetnoten springen',
    },
    code: { copy: 'Kopiëren', copied: 'Gekopieerd' },
  },
  tr: {
    header: {
      navToggle: 'Gezin menüsünü aç',
      siteNav: 'Site navigasyonu',
      search: 'Ara (Ctrl+K)',
      bgmToggle: 'Arka plan müziğini aç/kapat',
      langSwitch: 'Dil değiştir',
      themeToggle: 'Açık/koyu temayı değiştir',
    },
    bgm: {
      drawerTitle: 'Playlist · Arka plan müziği',
      close: 'Kapat',
      prev: 'Önceki',
      playPause: 'Oynat/Duraklat',
      next: 'Sonraki',
      volume: 'Ses',
      trackFallback: 'Parça 1',
    },
    lightbox: { dialog: 'Görünüm önizleme', close: 'Kapat' },
    contactCard: { close: 'İletişim kartını kapat', qrClose: 'Kapat' },
    stream: { replay: 'Yeniden oynat' },
    audio: {
      play: 'Oynat',
      defaultTitle: 'Ses oynatıcı',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Kapak',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili videosu',
      youtubeTitleFallback: 'YouTube videosu',
      bilibiliPlay: 'bilibili videosunu oynat',
      youtubePlay: 'YouTube videosunu oynat',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: parametre eksik, yapılandırmak için tıkla`,
      unknown: (name: string) => `Bilinmeyen yönerge: ${name}`,
    },
    toc: { title: 'İçindekiler' },
    publications: {
      abstract: 'Özet',
      copyBibtex: 'BibTeX kopyala',
      empty: 'Eşleşen yayın yok',
      linksAria: 'Yayın bağlantıları',
    },
    footnotes: {
      title: 'Dipnotlar',
      label: 'Dipnotlar',
      backToRef: (n: number) => 'Referansa geri dön ' + n,
      close: 'Kapat',
      jumpToBottom: 'Dipnotlara git',
    },
    code: { copy: 'Kopyala', copied: 'Kopyalandı' },
  },
  vi: {
    header: {
      navToggle: 'Mở menu điều hướng',
      siteNav: 'Điều hướng trang',
      search: 'Tìm kiếm (Ctrl+K)',
      bgmToggle: 'Bật/tắt nhạc nền',
      langSwitch: 'Đổi ngôn ngữ',
      themeToggle: 'Chuyển giao diện sáng/tối',
    },
    bgm: {
      drawerTitle: 'Playlist · Nhạc nền',
      close: 'Đóng',
      prev: 'Trước',
      playPause: 'Phát/Tạm dừng',
      next: 'Tiếp',
      volume: 'Âm lượng',
      trackFallback: 'Bản 1',
    },
    lightbox: { dialog: 'Xem trước ảnh', close: 'Đóng' },
    contactCard: { close: 'Đóng thẻ liên hệ', qrClose: 'Đóng' },
    stream: { replay: 'Phát lại' },
    audio: {
      play: 'Phát',
      defaultTitle: 'Trình phát âm thanh',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Bìa',
    },
    embed: {
      bilibiliTitleFallback: 'Video bilibili',
      youtubeTitleFallback: 'Video YouTube',
      bilibiliPlay: 'Phát video bilibili',
      youtubePlay: 'Phát video YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: thiếu tham số, bấm để cấu hình`,
      unknown: (name: string) => `Chỉ thị không xác định: ${name}`,
    },
    toc: { title: 'Mục lục' },
    publications: {
      abstract: 'Tóm tắt',
      copyBibtex: 'Sao chép BibTeX',
      empty: 'Không có ấn phẩm phù hợp',
      linksAria: 'Liên kết ấn phẩm',
    },
    footnotes: {
      title: 'Chú thích',
      label: 'Chú thích',
      backToRef: (n: number) => 'Quay lại tham chiếu ' + n,
      close: 'Đóng',
      jumpToBottom: 'Đi tới chú thích',
    },
    code: { copy: 'Sao chép', copied: 'Đã sao chép' },
  },
  th: {
    header: {
      navToggle: 'เปิดเมนูนำทาง',
      siteNav: 'การนำทางของเว็บไซต์',
      search: 'ค้นหา (Ctrl+K)',
      bgmToggle: 'เปิด/ปิด เพลงพื้นหลัง',
      langSwitch: 'เปลี่ยนภาษา',
      themeToggle: 'สลับธีมสว่าง/มืด',
    },
    bgm: {
      drawerTitle: 'Playlist · เพลงพื้นหลัง',
      close: 'ปิด',
      prev: 'ก่อนหน้า',
      playPause: 'เล่น/หยุดชั่วคราว',
      next: 'ถัดไป',
      volume: 'ระดับเสียง',
      trackFallback: 'แทร็ก 1',
    },
    lightbox: { dialog: 'ดูตัวอย่างรูปภาพ', close: 'ปิด' },
    contactCard: { close: 'ปิดการ์ดติดต่อ', qrClose: 'ปิด' },
    stream: { replay: 'เล่นอีกครั้ง' },
    audio: {
      play: 'เล่น',
      defaultTitle: 'เครื่องเล่นเสียง',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'ปก',
    },
    embed: {
      bilibiliTitleFallback: 'วิดีโอ bilibili',
      youtubeTitleFallback: 'วิดีโอ YouTube',
      bilibiliPlay: 'เล่นวิดีโอ bilibili',
      youtubePlay: 'เล่นวิดีโอ YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: ขาดพารามิเตอร์ คลิกเพื่อตั้งค่า`,
      unknown: (name: string) => `คำสั่งที่ไม่รู้จัก: ${name}`,
    },
    toc: { title: 'สารบัญ' },
    publications: {
      abstract: 'บทคัดย่อ',
      copyBibtex: 'คัดลอก BibTeX',
      empty: 'ไม่มีงานตีพิมพ์ที่ตรงกัน',
      linksAria: 'ลิงก์งานตีพิมพ์',
    },
    footnotes: {
      title: 'เชิงอรรถ',
      label: 'เชิงอรรถ',
      backToRef: (n: number) => 'กลับไปที่การอ้างอิง ' + n,
      close: 'ปิด',
      jumpToBottom: 'ไปยังเชิงอรรถ',
    },
    code: { copy: 'คัดลอก', copied: 'คัดลอกแล้ว' },
  },
  id: {
    header: {
      navToggle: 'Buka menu navigasi',
      siteNav: 'Navigasi situs',
      search: 'Cari (Ctrl+K)',
      bgmToggle: 'Aktifkan/nonaktifkan musik latar',
      langSwitch: 'Ganti bahasa',
      themeToggle: 'Ubah tema terang/gelap',
    },
    bgm: {
      drawerTitle: 'Playlist · Musik latar',
      close: 'Tutup',
      prev: 'Sebelumnya',
      playPause: 'Putar/Jeda',
      next: 'Berikutnya',
      volume: 'Volume',
      trackFallback: 'Lagu 1',
    },
    lightbox: { dialog: 'Pratinjau gambar', close: 'Tutup' },
    contactCard: { close: 'Tutup kartu kontak', qrClose: 'Tutup' },
    stream: { replay: 'Putar ulang' },
    audio: {
      play: 'Putar',
      defaultTitle: 'Pemutar audio',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'Sampul',
    },
    embed: {
      bilibiliTitleFallback: 'Video bilibili',
      youtubeTitleFallback: 'Video YouTube',
      bilibiliPlay: 'Putar video bilibili',
      youtubePlay: 'Putar video YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: parameter hilang, klik untuk konfigurasi`,
      unknown: (name: string) => `Direktif tidak dikenal: ${name}`,
    },
    toc: { title: 'Daftar isi' },
    publications: {
      abstract: 'Abstrak',
      copyBibtex: 'Salin BibTeX',
      empty: 'Tidak ada publikasi yang cocok',
      linksAria: 'Tautan publikasi',
    },
    footnotes: {
      title: 'Catatan Kaki',
      label: 'Catatan Kaki',
      backToRef: (n: number) => 'Kembali ke referensi ' + n,
      close: 'Tutup',
      jumpToBottom: 'Buka catatan kaki',
    },
    code: { copy: 'Salin', copied: 'Tersalin' },
  },
  ar: {
    header: {
      navToggle: 'فتح قائمة التنقل',
      siteNav: 'تنقل الموقع',
      search: 'بحث (Ctrl+K)',
      bgmToggle: 'تشغيل/إيقاف الموسيقى الخلفية',
      langSwitch: 'تغيير اللغة',
      themeToggle: 'تبديل السمة الفاتحة/الداكنة',
    },
    bgm: {
      drawerTitle: 'Playlist · موسيقى خلفية',
      close: 'إغلاق',
      prev: 'السابق',
      playPause: 'تشغيل/إيقاف',
      next: 'التالي',
      volume: 'الصوت',
      trackFallback: 'مقطع 1',
    },
    lightbox: { dialog: 'معاينة الصورة', close: 'إغلاق' },
    contactCard: { close: 'إغلاق بطاقة التواصل', qrClose: 'إغلاق' },
    stream: { replay: 'إعادة التشغيل' },
    audio: {
      play: 'تشغيل',
      defaultTitle: 'مشغل الصوت',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'الغلاف',
    },
    embed: {
      bilibiliTitleFallback: 'فيديو bilibili',
      youtubeTitleFallback: 'فيديو YouTube',
      bilibiliPlay: 'تشغيل فيديو bilibili',
      youtubePlay: 'تشغيل فيديو YouTube',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: معاملات مفقودة، انقر للتهيئة`,
      unknown: (name: string) => `توجيه غير معروف: ${name}`,
    },
    toc: { title: 'المحتويات' },
    publications: {
      abstract: 'ملخص',
      copyBibtex: 'نسخ BibTeX',
      empty: 'لا توجد منشورات مطابقة',
      linksAria: 'روابط المنشور',
    },
    footnotes: {
      title: 'الهوامش',
      label: 'الهوامش',
      backToRef: (n: number) => 'العودة إلى المرجع ' + n,
      close: 'إغلاق',
      jumpToBottom: 'الانتقال إلى الهوامش',
    },
    code: { copy: 'نسخ الكود', copied: 'تم النسخ' },
  },
  hi: {
    header: {
      navToggle: 'नेविगेशन मेनू खोलें',
      siteNav: 'साइट नेविगेशन',
      search: 'खोजें (Ctrl+K)',
      bgmToggle: 'बैकग्राउंड संगीत चालू/बंद करें',
      langSwitch: 'भाषा बदलें',
      themeToggle: 'लाइट/डार्क थीम टॉगल करें',
    },
    bgm: {
      drawerTitle: 'Playlist · बैकग्राउंड संगीत',
      close: 'बंद करें',
      prev: 'पिछला',
      playPause: 'चलाएं/रोकें',
      next: 'अगला',
      volume: 'वॉल्यूम',
      trackFallback: 'ट्रैक 1',
    },
    lightbox: { dialog: 'छवि पूर्वावलोकन', close: 'बंद करें' },
    contactCard: { close: 'संपर्क कार्ड बंद करें', qrClose: 'बंद करें' },
    stream: { replay: 'पुनः चलाएं' },
    audio: {
      play: 'चलाएं',
      defaultTitle: 'ऑडियो प्लेयर',
      timeFallback: '--:-- / --:--',
      coverAltFallback: 'कवर',
    },
    embed: {
      bilibiliTitleFallback: 'bilibili वीडियो',
      youtubeTitleFallback: 'YouTube वीडियो',
      bilibiliPlay: 'bilibili वीडियो चलाएं',
      youtubePlay: 'YouTube वीडियो चलाएं',
      bilibiliBadge: 'bilibili',
      youtubeBadge: 'YouTube',
    },
    directive: {
      missingParams: (name: string) => `${name}: पैरामीटर अनुपस्थित, कॉन्फ़िगर करने के लिए क्लिक करें`,
      unknown: (name: string) => `अज्ञात निर्देश: ${name}`,
    },
    toc: { title: 'विषय-सूची' },
    publications: {
      abstract: 'सारांश',
      copyBibtex: 'BibTeX कॉपी करें',
      empty: 'कोई मिलान प्रकाशन नहीं',
      linksAria: 'प्रकाशन लिंक',
    },
    footnotes: {
      title: 'पाद टिप्पणी',
      label: 'पाद टिप्पणी',
      backToRef: (n: number) => 'संदर्भ ' + n + ' पर वापस जाएं',
      close: 'बंद करें',
      jumpToBottom: 'पाद टिप्पणियों पर जाएं',
    },
    code: { copy: 'कोड कॉपी करें', copied: 'कॉपी किया गया' },
  },

};

export function getUiLabels(lang: string | null | undefined): UiLabels {
  return UI_LABELS[normalizeUiLang(lang)];
}

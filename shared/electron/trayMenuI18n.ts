export const TRAY_MENU_LOCALES = [
  'en',
  'ru',
  'de',
  'es',
  'fr',
  'ja',
  'pt',
  'cn',
] as const

export type TrayMenuLocale = (typeof TRAY_MENU_LOCALES)[number]

export type TrayMenuLabels = {
  show: string
  hide: string
  addMedia: string
  settings: string
  lock: string
  checkUpdates: string
  exit: string
  quit: string
  /** Jump List description strings */
  showDescription: string
  hideDescription: string
  addMediaDescription: string
  settingsDescription: string
  lockDescription: string
  checkUpdatesDescription: string
  exitDescription: string
}

const EN: TrayMenuLabels = {
  show: 'Show MediaChips',
  hide: 'Hide MediaChips',
  addMedia: 'Add Media',
  settings: 'Settings',
  lock: 'Lock',
  checkUpdates: 'Check for Updates',
  exit: 'Exit',
  quit: 'Quit',
  showDescription: 'Show the MediaChips window',
  hideDescription: 'Hide the MediaChips window',
  addMediaDescription: 'Add media files',
  settingsDescription: 'Open Settings',
  lockDescription: 'Lock MediaChips',
  checkUpdatesDescription: 'Check for MediaChips updates',
  exitDescription: 'Quit MediaChips',
}

const STRINGS: Record<TrayMenuLocale, TrayMenuLabels> = {
  en: EN,
  ru: {
    show: 'Показать MediaChips',
    hide: 'Скрыть MediaChips',
    addMedia: 'Добавить медиа',
    settings: 'Настройки',
    lock: 'Заблокировать',
    checkUpdates: 'Проверить обновления',
    exit: 'Выход',
    quit: 'Завершить',
    showDescription: 'Показать окно MediaChips',
    hideDescription: 'Скрыть окно MediaChips',
    addMediaDescription: 'Добавить медиафайлы',
    settingsDescription: 'Открыть настройки',
    lockDescription: 'Заблокировать MediaChips',
    checkUpdatesDescription: 'Проверить обновления MediaChips',
    exitDescription: 'Выйти из MediaChips',
  },
  de: {
    show: 'MediaChips anzeigen',
    hide: 'MediaChips ausblenden',
    addMedia: 'Medien hinzufügen',
    settings: 'Einstellungen',
    lock: 'Sperren',
    checkUpdates: 'Nach Updates suchen',
    exit: 'Beenden',
    quit: 'Beenden',
    showDescription: 'MediaChips-Fenster anzeigen',
    hideDescription: 'MediaChips-Fenster ausblenden',
    addMediaDescription: 'Mediendateien hinzufügen',
    settingsDescription: 'Einstellungen öffnen',
    lockDescription: 'MediaChips sperren',
    checkUpdatesDescription: 'Nach MediaChips-Updates suchen',
    exitDescription: 'MediaChips beenden',
  },
  es: {
    show: 'Mostrar MediaChips',
    hide: 'Ocultar MediaChips',
    addMedia: 'Añadir medios',
    settings: 'Ajustes',
    lock: 'Bloquear',
    checkUpdates: 'Buscar actualizaciones',
    exit: 'Salir',
    quit: 'Salir',
    showDescription: 'Mostrar la ventana de MediaChips',
    hideDescription: 'Ocultar la ventana de MediaChips',
    addMediaDescription: 'Añadir archivos multimedia',
    settingsDescription: 'Abrir ajustes',
    lockDescription: 'Bloquear MediaChips',
    checkUpdatesDescription: 'Buscar actualizaciones de MediaChips',
    exitDescription: 'Salir de MediaChips',
  },
  fr: {
    show: 'Afficher MediaChips',
    hide: 'Masquer MediaChips',
    addMedia: 'Ajouter des médias',
    settings: 'Réglages',
    lock: 'Verrouiller',
    checkUpdates: 'Rechercher des mises à jour',
    exit: 'Quitter',
    quit: 'Quitter',
    showDescription: 'Afficher la fenêtre MediaChips',
    hideDescription: 'Masquer la fenêtre MediaChips',
    addMediaDescription: 'Ajouter des fichiers multimédias',
    settingsDescription: 'Ouvrir les réglages',
    lockDescription: 'Verrouiller MediaChips',
    checkUpdatesDescription: 'Rechercher des mises à jour MediaChips',
    exitDescription: 'Quitter MediaChips',
  },
  ja: {
    show: 'MediaChipsを表示',
    hide: 'MediaChipsを隠す',
    addMedia: 'メディアを追加',
    settings: '設定',
    lock: 'ロック',
    checkUpdates: 'アップデートを確認',
    exit: '終了',
    quit: '終了',
    showDescription: 'MediaChipsウィンドウを表示',
    hideDescription: 'MediaChipsウィンドウを隠す',
    addMediaDescription: 'メディアファイルを追加',
    settingsDescription: '設定を開く',
    lockDescription: 'MediaChipsをロック',
    checkUpdatesDescription: 'MediaChipsのアップデートを確認',
    exitDescription: 'MediaChipsを終了',
  },
  pt: {
    show: 'Mostrar MediaChips',
    hide: 'Ocultar MediaChips',
    addMedia: 'Adicionar mídia',
    settings: 'Configurações',
    lock: 'Bloquear',
    checkUpdates: 'Verificar atualizações',
    exit: 'Sair',
    quit: 'Sair',
    showDescription: 'Mostrar a janela do MediaChips',
    hideDescription: 'Ocultar a janela do MediaChips',
    addMediaDescription: 'Adicionar arquivos de mídia',
    settingsDescription: 'Abrir configurações',
    lockDescription: 'Bloquear o MediaChips',
    checkUpdatesDescription: 'Verificar atualizações do MediaChips',
    exitDescription: 'Sair do MediaChips',
  },
  cn: {
    show: '显示 MediaChips',
    hide: '隐藏 MediaChips',
    addMedia: '添加媒体',
    settings: '设置',
    lock: '锁定',
    checkUpdates: '检查更新',
    exit: '退出',
    quit: '退出',
    showDescription: '显示 MediaChips 窗口',
    hideDescription: '隐藏 MediaChips 窗口',
    addMediaDescription: '添加媒体文件',
    settingsDescription: '打开设置',
    lockDescription: '锁定 MediaChips',
    checkUpdatesDescription: '检查 MediaChips 更新',
    exitDescription: '退出 MediaChips',
  },
}

export function normalizeTrayMenuLocale(value: unknown): TrayMenuLocale {
  const code = String(value || 'en').trim().toLowerCase()
  if ((TRAY_MENU_LOCALES as readonly string[]).includes(code)) {
    return code as TrayMenuLocale
  }
  return 'en'
}

export function getTrayMenuLabels(locale: unknown): TrayMenuLabels {
  return STRINGS[normalizeTrayMenuLocale(locale)]
}

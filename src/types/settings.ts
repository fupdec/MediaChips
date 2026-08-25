export type { DatabaseSizesResponse, BackupEntry } from '@shared/api/responses'

export type DatabaseEntry = {
  id: string
  name: string
  active: boolean
  createdAt: number
  icon?: string
}

export type MissingMediaStatus = {
  total: number
  missing: number | null
  withHash: number | null
  withoutHash: number | null
}

export type MissingMediaMatch = {
  id: string | number
  confidence: 'hash' | 'size' | string
  newPath: string
  oldPath: string
}

export type MissingMediaSummary = {
  scanned: number
  matched: number
  missing: number
  stopped: boolean
}

export type MissingMediaSearchEvent =
  | {
    type: 'progress'
    phase?: string
    scanned?: number
    matched?: number
    missing?: number
    current?: string
    total?: number
    processed?: number
  }
  | { type: 'match'; match: MissingMediaMatch }
  | {
    type: 'complete'
    matches?: MissingMediaMatch[]
    scanned?: number
    matched?: number
    missing?: number
    stopped?: boolean
  }
  | { type: 'error'; message?: string }

export type RelinkMissingMediaResponse = {
  updated?: number
}

export type ParseLibraryTagsStatus = {
  totalMedia: number
  parserMetas: Array<{ id: number; name: string }>
  parserTags: number
}

export type ParseLibraryTagsPreviewTag = {
  tagId: number
  metaId: number
  tagName: string
  metaName: string
  isNew: boolean
  willCreate?: boolean
}

export type ParseLibraryTagsPreviewItem = {
  mediaId: number
  path: string
  tags: ParseLibraryTagsPreviewTag[]
}

export type ParseLibraryTagsSummary = {
  totalMedia: number
  mediaWithNewTags: number
  totalNewTags: number
  totalProposedTags: number
  stopped: boolean
}

export type ParseLibraryTagsSearchEvent =
  | { type: 'progress'; processed?: number; total?: number; current?: string }
  | { type: 'item'; item: ParseLibraryTagsPreviewItem }
  | {
    type: 'complete'
    summary?: ParseLibraryTagsSummary
    items?: ParseLibraryTagsPreviewItem[]
  }
  | { type: 'error'; message?: string }

export type ApplyParseLibraryTagsResponse = {
  applied?: number
}

export type SettingsState = {
  allowLanAccess: string
  passwordProtection: string
  phrase: string
  passwordHint: string
  /** Idle minutes before auto-lock; '0' disables. Requires passwordProtection. */
  autoLockIdleMinutes: string
  videoPreviewEnabled: string
  videoPreviewStatic: string
  videoPreviewHover: string
  delayVideoPreview: string
  appColorLightHeader: string
  appColorLightPrimary: string
  appColorLightSecondary: string
  appColorDarkHeader: string
  appColorDarkPrimary: string
  appColorDarkSecondary: string
  headerGradientLight: string
  headerGradientDark: string
  darkMode: string
  headerGradient: string
  colorScroll: string
  textFont: string
  headerFont: string
  bottomBar: string
  /**
   * @deprecated Always-on browser layout. Kept for settings DB compatibility.
   * Classic layout has been removed.
   */
  browserLayout: string
  /** '1' when the browser-layout inspector panel is collapsed. */
  inspectorCollapsed: string
  /**
   * '1' — inspector shows the inline edit form.
   * '0' — inspector shows read-only details (classic view).
   */
  inspectorInlineEdit: string
  /**
   * '1' — items control deck stays sticky above the grid while scrolling.
   * '0' — deck scrolls away with the page.
   */
  stickyControlDeck: string
  /** '1' when the browser-layout sidebar is collapsed. */
  sidebarCollapsed: string
  showPlaylistsInNavigation: string
  showMarkersInNavigation: string
  /**
   * JSON order/visibility for Library sidebar items
   * (`home`, `folders`, `playlists`, `markers`, `media-{id}`).
   */
  library_nav_config: string
  /** '1' shows Trash in the app bar and sidebar / bottom navigation. */
  showTrashInNavigation: string
  numberOfPagesLimit: string
  gapSize: string
  /** Slideshow step interval in seconds for the image viewer. */
  imageSlideshowInterval: string
  /** '1' loops slideshow from the start after the last image. */
  imageSlideshowLoop: string
  /** '1' enables virtualized media card/masonry grids for large lists. */
  virtualImageGrid: string
  isPlayVideoInSystemPlayer: string
  typingFiltersDefault: string
  watchFolders: string
  selectedDisk: string
  zoom: string
  checkForUpdatesAtStartup: string
  startupHealthNotifications: string
  showIconsOfMetaInEditingDialog: string
  /** '1' expands the media/tag overview panel in editing dialogs. */
  editingOverviewExpanded: string
  mixedTagsInputInEditingDialog: string
  showEmptyMetaValueInCard: string
  showIconsInsteadTextOnFiltersChips: string
  showHeaderImageAboveProfile: string
  showExperimentalFeatures: string
  showSavedFilters: string
  showAdultContent: string
  enabledPlugins: string
  /** One-shot migration marker for default enabledPlugins upgrades. */
  enabledPluginsSchemaVersion: string
  tpdbApiKey: string
  tmdbApiKey: string
  tmdbPersonMetaId: string
  jellyfinBaseUrl: string
  jellyfinApiKey: string
  jellyfinLibraryIds: string
  jellyfinCreateMissingMedia: string
  jellyfinLastSyncAt: string
  jellyfinLastSyncSummary: string
  jellyfinLastPushAt: string
  jellyfinLastPushSummary: string
  stashDbPath: string
  stashGraphqlUrl: string
  stashApiKey: string
  stashCreateMissingMedia: string
  stashLastSyncAt: string
  stashLastSyncSummary: string
  stashLastPushAt: string
  stashLastPushSummary: string
  scraperPerformerGender: string
  sceneAutoApplyOnExactMatch: string
  sceneScraperImportMarkers: string
  sceneScraperMarkerMetaId: string
  sfwMode: string
  registration: string
  databaseVersion: string
  restorePlaybackTime: string
  locale: string
  transcodeUnsupportedFormats: string
  transcodeMaxHeight: string
  transcodeCacheMaxGb: string
  conversionCodec: string
  conversionResolution: string
  conversionQuality: string
  conversionDestination: string
  conversionDeleteOriginal: string
  conversionCompatibilityTest: string
  ratingAndFavoriteInCard: string
  group_chips_in_card_description: string
  show_preset_metadata_in_card: string
  count_number_of_views: string
  meta_sort_mode: string
  meta_group_by: string
  system_dark_mode: string
  open_player_in_separate_window: string
  show_quick_action_button: string
  play_sound_on_video_preview: string
  big_video_preview: string
  big_video_preview_delay: string
  big_video_preview_size: string
  /** '1' shows full title/meta plate beside fixed-height media cards on hover. */
  card_hover_meta_plate: string
  show_salutation: string
  show_ip_at_home_screen: string
  onboardingCompleted: string
  onboardingStep: string
  onboardingPaused: string
  home_widgets_config: string
  show_alert_new_tool_words: string
  show_default_meta_outlined: string
  show_default_meta_label: string
  show_default_meta_filesize: string
  show_default_meta_duration: string
  show_default_meta_resolution: string
  show_default_meta_ext: string
  show_default_meta_codec: string
  show_default_meta_bitrate: string
  show_default_meta_fps: string
  show_default_meta_number_media: string
  show_default_meta_number_views: string
  default_meta_chip_variant: string
  'pathParser.useML': string
  'pathParser.similarityThreshold': string
  'pathParser.folderWeight': string
  'pathParser.clusterThreshold': string
  'pathParser.preferLongestMatch': string
  'pathParser.matchPrecision': string
  defaultTagCategoryId: string
  tagSuggestionBanList: string
  'faceMatch.performerMetaId': string
  'faceMatch.minConfidence': string
  'faceMatch.candidateLimit': string
  'faceMatch.mode': string
  'faceMatch.matchAfterDetect': string
  'faceMatch.autoBlindTags': string
  'faceMatch.embedModelId': string
  'faceDetect.minScore': string
  'faceDetect.framesPerVideo': string
  'faceDetect.genderFilter': string
  'localAi.enabled': string
}

export const defaultSettingsState = (): SettingsState => ({
  allowLanAccess: '1',
  passwordProtection: '0',
  phrase: '',
  passwordHint: '',
  autoLockIdleMinutes: '0',
  videoPreviewEnabled: '0',
  videoPreviewStatic: 'thumb',
  videoPreviewHover: 'video',
  delayVideoPreview: '0',
  appColorLightHeader: '#9298EB',
  appColorLightPrimary: '#8A86F2',
  appColorLightSecondary: '#F8B31A',
  appColorDarkHeader: '#6E6AAD',
  appColorDarkPrimary: '#887ED5',
  appColorDarkSecondary: '#E98700',
  headerGradientLight: 'linear-gradient(to right,#ffb458,#6868eb)',
  headerGradientDark: 'linear-gradient(to right,#a9743d,#4a3c81)',
  darkMode: '0',
  headerGradient: '0',
  colorScroll: '0',
  textFont: 'Roboto',
  headerFont: 'Roboto',
  bottomBar: '0',
  browserLayout: '1',
  inspectorCollapsed: '0',
  inspectorInlineEdit: '1',
  stickyControlDeck: '1',
  sidebarCollapsed: '0',
  showPlaylistsInNavigation: '1',
  showMarkersInNavigation: '1',
  library_nav_config: '',
  showTrashInNavigation: '1',
  numberOfPagesLimit: '7',
  gapSize: '2',
  imageSlideshowInterval: '4',
  imageSlideshowLoop: '0',
  virtualImageGrid: '1',
  isPlayVideoInSystemPlayer: '0',
  typingFiltersDefault: '0',
  watchFolders: '0',
  selectedDisk: '',
  zoom: '1',
  checkForUpdatesAtStartup: '1',
  startupHealthNotifications: '1',
  showIconsOfMetaInEditingDialog: '1',
  editingOverviewExpanded: '0',
  mixedTagsInputInEditingDialog: '0',
  showEmptyMetaValueInCard: '1',
  showIconsInsteadTextOnFiltersChips: '0',
  showHeaderImageAboveProfile: '1',
  showExperimentalFeatures: '0',
  showSavedFilters: '1',
  showAdultContent: '0',
  enabledPlugins: '["mediachips.adult","mediachips.stash","mediachips.jellyfin","mediachips.plex","mediachips.emby","mediachips.tmdb"]',
  /** '0' until first bootstrap migration persists the current schema. */
  enabledPluginsSchemaVersion: '0',
  tpdbApiKey: '',
  tmdbApiKey: '',
  tmdbPersonMetaId: '',
  jellyfinBaseUrl: '',
  jellyfinApiKey: '',
  jellyfinLibraryIds: '[]',
  jellyfinCreateMissingMedia: '0',
  jellyfinLastSyncAt: '',
  jellyfinLastSyncSummary: '',
  jellyfinLastPushAt: '',
  jellyfinLastPushSummary: '',
  stashDbPath: '',
  stashGraphqlUrl: '',
  stashApiKey: '',
  stashCreateMissingMedia: '0',
  stashLastSyncAt: '',
  stashLastSyncSummary: '',
  stashLastPushAt: '',
  stashLastPushSummary: '',
  scraperPerformerGender: 'Female',
  sceneAutoApplyOnExactMatch: '0',
  sceneScraperImportMarkers: '1',
  sceneScraperMarkerMetaId: '',
  sfwMode: '0',
  registration: '',
  databaseVersion: '',
  restorePlaybackTime: '1',
  locale: 'en',
  transcodeUnsupportedFormats: '1',
  transcodeMaxHeight: '1080',
  transcodeCacheMaxGb: '5',
  conversionCodec: 'auto',
  conversionResolution: '1080',
  conversionQuality: 'balanced',
  conversionDestination: '',
  conversionDeleteOriginal: '0',
  conversionCompatibilityTest: '',
  ratingAndFavoriteInCard: '1',
  group_chips_in_card_description: '1',
  show_preset_metadata_in_card: '1',
  count_number_of_views: '1',
  meta_sort_mode: 'menu',
  meta_group_by: 'none',
  system_dark_mode: '1',
  open_player_in_separate_window: '1',
  show_quick_action_button: '0',
  play_sound_on_video_preview: '1',
  big_video_preview: '1',
  big_video_preview_delay: '2000',
  big_video_preview_size: 'full_height',
  card_hover_meta_plate: '0',
  show_salutation: '1',
  show_ip_at_home_screen: '1',
  onboardingCompleted: '0',
  onboardingStep: '0',
  onboardingPaused: '0',
  home_widgets_config: '',
  show_alert_new_tool_words: '1',
  show_default_meta_outlined: '1',
  show_default_meta_label: '1',
  show_default_meta_filesize: '0',
  show_default_meta_duration: '0',
  show_default_meta_resolution: '0',
  show_default_meta_ext: '0',
  show_default_meta_codec: '0',
  show_default_meta_bitrate: '0',
  show_default_meta_fps: '0',
  show_default_meta_number_media: '0',
  show_default_meta_number_views: '0',
  default_meta_chip_variant: 'flat',
  'pathParser.useML': 'true',
  'pathParser.similarityThreshold': '0.75',
  'pathParser.folderWeight': '1.5',
  'pathParser.clusterThreshold': '0.88',
  'pathParser.preferLongestMatch': 'true',
  'pathParser.matchPrecision': '0.5',
  defaultTagCategoryId: '',
  tagSuggestionBanList: '[]',
  'faceMatch.performerMetaId': '',
  'faceMatch.minConfidence': '0.55',
  'faceMatch.candidateLimit': '10',
  'faceMatch.mode': 'suggest',
  'faceMatch.matchAfterDetect': '1',
  'faceMatch.autoBlindTags': '0',
  'faceMatch.embedModelId': 'insightface-r50-scrfd-kps-v1',
  'faceDetect.minScore': '0.5',
  'faceDetect.framesPerVideo': '6',
  'faceDetect.genderFilter': 'both',
  'localAi.enabled': '0',
})

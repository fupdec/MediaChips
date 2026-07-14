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
  showPlaylistsInNavigation: string
  showMarkersInNavigation: string
  numberOfPagesLimit: string
  gapSize: string
  isPlayVideoInSystemPlayer: string
  typingFiltersDefault: string
  watchFolders: string
  selectedDisk: string
  zoom: string
  checkForUpdatesAtStartup: string
  showIconsOfMetaInEditingDialog: string
  showEmptyMetaValueInCard: string
  showIconsInsteadTextOnFiltersChips: string
  showHeaderImageAboveProfile: string
  showExperimentalFeatures: string
  showSavedFilters: string
  showAdultContent: string
  enabledPlugins: string
  tpdbApiKey: string
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
  ratingAndFavoriteInCard: string
  group_chips_in_card_description: string
  show_preset_metadata_in_card: string
  count_number_of_views: string
  meta_sort_mode: string
  system_dark_mode: string
  open_player_in_separate_window: string
  show_quick_action_button: string
  play_sound_on_video_preview: string
  big_video_preview: string
  big_video_preview_delay: string
  big_video_preview_size: string
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
}

export const defaultSettingsState = (): SettingsState => ({
  allowLanAccess: '1',
  passwordProtection: '0',
  phrase: '',
  passwordHint: '',
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
  showPlaylistsInNavigation: '1',
  showMarkersInNavigation: '1',
  numberOfPagesLimit: '7',
  gapSize: '2',
  isPlayVideoInSystemPlayer: '0',
  typingFiltersDefault: '0',
  watchFolders: '0',
  selectedDisk: '',
  zoom: '1',
  checkForUpdatesAtStartup: '1',
  showIconsOfMetaInEditingDialog: '1',
  showEmptyMetaValueInCard: '1',
  showIconsInsteadTextOnFiltersChips: '0',
  showHeaderImageAboveProfile: '1',
  showExperimentalFeatures: '0',
  showSavedFilters: '1',
  showAdultContent: '0',
  enabledPlugins: '["mediachips.adult"]',
  tpdbApiKey: '',
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
  ratingAndFavoriteInCard: '1',
  group_chips_in_card_description: '1',
  show_preset_metadata_in_card: '1',
  count_number_of_views: '1',
  meta_sort_mode: 'menu',
  system_dark_mode: '1',
  open_player_in_separate_window: '1',
  show_quick_action_button: '1',
  play_sound_on_video_preview: '1',
  big_video_preview: '1',
  big_video_preview_delay: '2000',
  big_video_preview_size: 'full_height',
  show_salutation: '1',
  show_ip_at_home_screen: '1',
  onboardingCompleted: '0',
  onboardingStep: '0',
  onboardingPaused: '0',
  home_widgets_config: '',
  show_alert_new_tool_words: '1',
  show_default_meta_outlined: '1',
  show_default_meta_label: '1',
  show_default_meta_filesize: '1',
  show_default_meta_duration: '0',
  show_default_meta_resolution: '0',
  show_default_meta_ext: '0',
  show_default_meta_codec: '0',
  show_default_meta_bitrate: '0',
  show_default_meta_fps: '0',
  show_default_meta_number_media: '1',
  show_default_meta_number_views: '1',
  default_meta_chip_variant: 'flat',
  'pathParser.useML': 'true',
  'pathParser.similarityThreshold': '0.75',
  'pathParser.folderWeight': '1.5',
  'pathParser.clusterThreshold': '0.88',
  'pathParser.preferLongestMatch': 'true',
  'pathParser.matchPrecision': '0.5',
})

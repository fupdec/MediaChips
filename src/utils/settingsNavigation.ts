import type {PluginSettingsPanelContribution} from '@shared/plugins/types'

export interface SettingsSectionDefinition {
  key: string
  elementId: string
  tab: string
  titleKey: string
  icon?: string
  searchKeys: string[]
  keywords?: string[]
  localAi?: boolean
}
export interface SettingsSearchItem {
  section: string
  tab: string
  title: string
  category: string
  sectionIcon?: string
  categoryIcon?: string
  terms: string[]
}

// Stable public section keys and DOM anchors; changing a destination must not break old links.
export const CORE_SETTINGS_TABS = [
  {
    "value": "general",
    "icon": "mdi-application-cog-outline",
    "labelKey": "settingsLayout.general",
    "descKey": "settingsLayout.general_hint",
    "docId": "settings-doc-tab-general"
  },
  {
    "value": "appearance",
    "icon": "mdi-brush-variant",
    "labelKey": "settingsLayout.appearance",
    "descKey": "settingsLayout.appearance_hint",
    "docId": "settings-doc-tab-appearance"
  },
  {
    "value": "viewing",
    "icon": "mdi-play-circle-outline",
    "labelKey": "settingsLayout.viewing",
    "descKey": "settingsLayout.viewing_hint",
    "docId": "settings-doc-tab-viewing"
  },
  {
    "value": "library",
    "icon": "mdi-bookshelf",
    "labelKey": "settingsLayout.library",
    "descKey": "settingsLayout.library_hint",
    "docId": "settings-doc-tab-library"
  },
  {
    "value": "connections",
    "icon": "mdi-connection",
    "labelKey": "settingsLayout.connections",
    "descKey": "settingsLayout.connections_hint",
    "docId": "settings-doc-tab-connections"
  },
  {
    "value": "processing",
    "icon": "mdi-auto-fix",
    "labelKey": "settingsLayout.processing",
    "descKey": "settingsLayout.processing_hint",
    "docId": "settings-doc-tab-processing"
  },
  {
    "value": "maintenance",
    "icon": "mdi-wrench-outline",
    "labelKey": "settingsLayout.maintenance",
    "descKey": "settingsLayout.maintenance_hint",
    "docId": "settings-doc-tab-maintenance"
  },
  {
    "value": "database",
    "icon": "mdi-database-outline",
    "labelKey": "settingsLayout.database",
    "descKey": "settingsLayout.database_hint",
    "docId": "settings-doc-tab-database"
  },
  {
    "value": "plugins",
    "icon": "mdi-puzzle-outline",
    "labelKey": "settingsLayout.plugins",
    "descKey": "settingsLayout.plugins_hint",
    "docId": "settings-doc-tab-plugins"
  },
  {
    "value": "about",
    "icon": "mdi-information-variant",
    "labelKey": "settingsLayout.about",
    "descKey": "settingsLayout.about_hint",
    "docId": "settings-doc-tab-about"
  }
]

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    "key": "general_app",
    "elementId": "settings-general",
    "tab": "general",
    "titleKey": "settings_labels.general.group_network",
    "searchKeys": [
      "settings_labels.general.group_network",
      "settings_labels.general.browser_access",
      "settings_labels.general.browser_access_disabled",
      "settings_labels.general.allow_lan_access",
      "settings_labels.general.allow_lan_access_hint",
      "settings_labels.general.allow_lan_access_env_locked",
      "settings_labels.general.copy_link"
    ]
  },
  {
    "key": "network",
    "icon": "mdi-lan",
    "elementId": "settings-network",
    "tab": "general",
    "titleKey": "settings_labels.general.group_network",
    "searchKeys": [
      "settings_labels.general.group_network",
      "settings_labels.general.browser_access",
      "settings_labels.general.browser_access_disabled",
      "settings_labels.general.allow_lan_access",
      "settings_labels.general.allow_lan_access_hint",
      "settings_labels.general.allow_lan_access_env_locked",
      "settings_labels.general.copy_link"
    ]
  },
  {
    "key": "locale",
    "icon": "mdi-translate",
    "elementId": "settings-locale",
    "tab": "general",
    "titleKey": "settings.groups.localization",
    "searchKeys": [
      "settings.groups.localization"
    ]
  },
  {
    "key": "login",
    "icon": "mdi-security",
    "elementId": "settings-login",
    "tab": "general",
    "titleKey": "settings_labels.security.title",
    "searchKeys": [
      "settings_labels.security.auto_lock_idle",
      "settings_labels.security.auto_lock_idle_hint",
      "settings_labels.security.auto_lock_idle_minutes",
      "settings_labels.security.auto_lock_idle_off",
      "settings_labels.security.password",
      "settings_labels.security.password_protection",
      "settings_labels.security.password_protection_hint",
      "settings_labels.security.title"
    ]
  },
  {
    "key": "video_player",
    "icon": "mdi-play-circle",
    "elementId": "settings-video-player",
    "tab": "viewing",
    "titleKey": "settings_labels.video_player.title",
    "searchKeys": [
      "conversionSettings.quality",
      "conversionSettings.quality_hint",
      "conversionSettings.economy",
      "conversionSettings.balanced",
      "conversionSettings.high",
      "conversionSettings.resolution",
      "conversionSettings.resolution_hint",
      "conversionSettings.original",
      "conversionSettings.max_4k",
      "conversionSettings.max_1080",
      "conversionSettings.max_720",
      "conversionSettings.max_480",
      "settings_labels.video_player.clear_transcode_cache",
      "settings_labels.video_player.clear_transcode_cache_done",
      "settings_labels.video_player.clear_transcode_cache_hint",
      "settings_labels.video_player.open_separate_window",
      "settings_labels.video_player.open_separate_window_hint",
      "settings_labels.video_player.open_system_player",
      "settings_labels.video_player.open_system_player_hint",
      "settings_labels.video_player.restore_playback_time",
      "settings_labels.video_player.restore_playback_time_hint",
      "settings_labels.video_player.title",
      "settings_labels.video_player.transcode_cache_usage",
      "settings_labels.video_player.transcode_unsupported",
      "settings_labels.video_player.transcode_unsupported_hint",
      "settings_labels.general.count_views",
      "settings_labels.general.count_views_hint"
    ]
  },
  {
    "key": "video_preview",
    "icon": "mdi-animation-play",
    "elementId": "video_preview",
    "tab": "viewing",
    "titleKey": "settings_labels.appearance.video_preview",
    "searchKeys": [
      "settings_labels.appearance.big_preview",
      "settings_labels.appearance.big_preview_delay",
      "settings_labels.appearance.big_preview_delay_warning",
      "settings_labels.appearance.big_preview_set_thumb_hint",
      "settings_labels.appearance.grid_3x3",
      "settings_labels.appearance.hover_preview",
      "settings_labels.appearance.hover_preview_hint",
      "settings_labels.appearance.play_sound",
      "settings_labels.appearance.preview_delay",
      "settings_labels.appearance.static_preview",
      "settings_labels.appearance.static_preview_hint",
      "settings_labels.appearance.thumb",
      "settings_labels.appearance.timeline",
      "settings_labels.appearance.video",
      "settings_labels.appearance.video_preview",
      "settings_labels.appearance.video_preview_cpu_chip",
      "settings_labels.appearance.video_preview_cpu_warning",
      "settings_labels.appearance.video_preview_slow_warning"
    ]
  },
  {
    "key": "appearance_theme",
    "icon": "mdi-theme-light-dark",
    "elementId": "settings-appearance-theme",
    "tab": "appearance",
    "titleKey": "settings_labels.appearance.group_theme",
    "searchKeys": [
      "settings_labels.appearance.dark_mode",
      "settings_labels.appearance.group_theme",
      "settings_labels.appearance.sync_dark_mode",
      "settings_labels.appearance.zoom",
      "settings_labels.appearance.zoom_hint_or",
      "settings_labels.appearance.zoom_hint_reset",
      "settings_labels.appearance.zoom_reset"
    ]
  },
  {
    "key": "appearance_navigation",
    "icon": "mdi-menu",
    "elementId": "settings-appearance-navigation",
    "tab": "appearance",
    "titleKey": "settings_labels.appearance.group_navigation",
    "searchKeys": [
      "settingsLayout.show_history_button",
      "settingsLayout.show_history_button_hint",
      "settings_labels.appearance.group_navigation",
      "settings_labels.appearance.nav_bottom",
      "settings_labels.appearance.show_markers",
      "settings_labels.appearance.show_playlists",
      "settings_labels.appearance.show_trash"
    ]
  },
  {
    "key": "appearance_colors",
    "icon": "mdi-brush-variant",
    "elementId": "settings-appearance-colors",
    "tab": "appearance",
    "titleKey": "settings_labels.appearance.colors",
    "searchKeys": [
      "settings_labels.appearance.colors",
      "settings_labels.appearance.dark_theme",
      "settings_labels.appearance.generate_theme",
      "settings_labels.appearance.generate_theme_both",
      "settings_labels.appearance.generate_theme_dark",
      "settings_labels.appearance.generate_theme_hint",
      "settings_labels.appearance.generate_theme_light",
      "settings_labels.appearance.gradient",
      "settings_labels.appearance.gradient_hint",
      "settings_labels.appearance.light_theme",
      "settings_labels.appearance.primary",
      "settings_labels.appearance.secondary",
      "settings_labels.appearance.toolbar"
    ]
  },
  {
    "key": "appearance_cards",
    "icon": "mdi-view-grid-outline",
    "elementId": "settings-appearance-cards",
    "tab": "appearance",
    "titleKey": "settings_labels.appearance.cards",
    "searchKeys": [
      "settings_labels.appearance.cards",
      "settings_labels.appearance.chip_variant",
      "settings_labels.appearance.group_card_display",
      "settings_labels.appearance.group_card_metadata",
      "settings_labels.appearance.group_chips_description",
      "settings_labels.appearance.label_chips_default_metadata",
      "settings_labels.appearance.rating_favorite_description",
      "settings_labels.appearance.show_bookmark_on_card",
      "settings_labels.appearance.show_default_metadata",
      "settings_labels.appearance.show_thumb_resolution"
    ]
  },
  {
    "key": "appearance_page",
    "icon": "mdi-page-layout-body",
    "elementId": "settings-appearance-page",
    "tab": "appearance",
    "titleKey": "settings_labels.appearance.page",
    "searchKeys": [
      "settings_labels.appearance.alphabet_filter",
      "settings_labels.appearance.alphabet_filter_hint",
      "settings_labels.appearance.color_filter",
      "settings_labels.appearance.color_filter_hint",
      "settings_labels.appearance.editing_overview_expanded",
      "settings_labels.appearance.editing_overview_expanded_hint",
      "settings_labels.appearance.example_pagination",
      "settings_labels.appearance.filter_chip_sample",
      "settings_labels.appearance.gap_size_between_items",
      "settings_labels.appearance.group_editing",
      "settings_labels.appearance.group_interface",
      "settings_labels.appearance.group_layout",
      "settings_labels.appearance.icons_filter_chips",
      "settings_labels.appearance.inspector_inline_edit",
      "settings_labels.appearance.inspector_inline_edit_hint",
      "settings_labels.appearance.meta_icon_editing_dialog",
      "settings_labels.appearance.mixed_tags_input",
      "settings_labels.appearance.mixed_tags_input_hint",
      "settings_labels.appearance.page",
      "settings_labels.appearance.quick_action_button",
      "settings_labels.appearance.quick_action_button_hint",
      "settings_labels.appearance.saved_filters",
      "settings_labels.appearance.saved_filters_hint",
      "settings_labels.appearance.sticky_control_deck",
      "settings_labels.appearance.sticky_control_deck_hint",
      "settings_labels.appearance.visible_pages_pagination"
    ]
  },
  {
    "key": "appearance_image_viewer",
    "icon": "mdi-image-multiple-outline",
    "elementId": "settings-appearance-image-viewer",
    "tab": "viewing",
    "titleKey": "settings_labels.appearance.image_viewer",
    "searchKeys": [
      "settings_labels.appearance.image_viewer",
      "settings_labels.appearance.slideshow_interval",
      "settings_labels.appearance.slideshow_interval_hint",
      "settings_labels.appearance.slideshow_loop",
      "settings_labels.appearance.slideshow_loop_hint"
    ]
  },
  {
    "key": "image_grid",
    "elementId": "settings-image-grid",
    "tab": "appearance",
    "titleKey": "settings_labels.appearance.virtual_image_grid",
    "searchKeys": [
      "settings_labels.appearance.virtual_image_grid",
      "settings_labels.appearance.virtual_image_grid_hint"
    ]
  },
  {
    "key": "appearance_sfw",
    "icon": "mdi-eye-off",
    "elementId": "settings-appearance-sfw",
    "tab": "general",
    "titleKey": "settings_labels.tools.sfw_mode",
    "searchKeys": [
      "settings_labels.tools.sfw_mode",
      "settings_labels.tools.sfw_mode_hint"
    ]
  },
  {
    "key": "meta",
    "icon": "mdi-shape-outline",
    "elementId": "settings-meta",
    "tab": "library",
    "titleKey": "settings.tabs.meta",
    "searchKeys": [
      "settings.tabs.meta",
      "settings_labels.meta.filter_all_types",
      "settings_labels.meta.group_label"
    ]
  },
  {
    "key": "tag_categories",
    "icon": "mdi-tag-multiple-outline",
    "elementId": "settings-tag-categories",
    "tab": "library",
    "titleKey": "settings_labels.library.tag_categories",
    "searchKeys": [
      "settings_labels.library.default_tag_category",
      "settings_labels.library.default_tag_category_hint",
      "settings_labels.library.default_tag_category_placeholder",
      "settings_labels.library.merge_tag_categories_hint",
      "settings_labels.library.tag_categories"
    ]
  },
  {
    "key": "chip_recipes",
    "icon": "mdi-puzzle-outline",
    "elementId": "settings-chip-recipes",
    "tab": "library",
    "titleKey": "settings_labels.library.chip_recipes",
    "searchKeys": [
      "settings_labels.library.chip_recipes",
      "settings_labels.library.chip_recipes_apply",
      "settings_labels.library.chip_recipes_apply_success",
      "settings_labels.library.chip_recipes_author",
      "settings_labels.library.chip_recipes_catalog",
      "settings_labels.library.chip_recipes_catalog_empty",
      "settings_labels.library.chip_recipes_catalog_empty_hint",
      "settings_labels.library.chip_recipes_catalog_error",
      "settings_labels.library.chip_recipes_catalog_hint",
      "settings_labels.library.chip_recipes_category",
      "settings_labels.library.chip_recipes_description",
      "settings_labels.library.chip_recipes_export",
      "settings_labels.library.chip_recipes_export_dialog_hint",
      "settings_labels.library.chip_recipes_export_success",
      "settings_labels.library.chip_recipes_fields",
      "settings_labels.library.chip_recipes_fields_empty",
      "settings_labels.library.chip_recipes_hint",
      "settings_labels.library.chip_recipes_import_file",
      "settings_labels.library.chip_recipes_include_tags",
      "settings_labels.library.chip_recipes_include_tags_hint",
      "settings_labels.library.chip_recipes_install",
      "settings_labels.library.chip_recipes_missing_media_types",
      "settings_labels.library.chip_recipes_name",
      "settings_labels.library.chip_recipes_preview",
      "settings_labels.library.chip_recipes_preview_fields",
      "settings_labels.library.chip_recipes_preview_pins",
      "settings_labels.library.chip_recipes_preview_tags",
      "settings_labels.library.chip_recipes_refresh_catalog",
      "settings_labels.library.chip_recipes_select_all",
      "settings_labels.library.chip_recipes_selected_count",
      "settings_labels.library.chip_recipes_sfw",
      "settings_labels.library.chip_recipes_share_discord"
    ]
  },
  {
    "key": "media_types",
    "icon": "mdi-file-outline",
    "elementId": "settings-media-types",
    "tab": "library",
    "titleKey": "settings.tabs.media",
    "searchKeys": [
      "settings.tabs.media"
    ]
  },
  {
    "key": "field_pinning",
    "icon": "mdi-pin-outline",
    "elementId": "settings-meta-assignment",
    "tab": "library",
    "titleKey": "settings_labels.field_pinning.title",
    "searchKeys": [
      "settings_labels.field_pinning.assigned_fields_count",
      "settings_labels.field_pinning.child_fields_count",
      "settings_labels.field_pinning.hint",
      "settings_labels.field_pinning.no_tag_categories",
      "settings_labels.field_pinning.select_media_type",
      "settings_labels.field_pinning.select_tag_category",
      "settings_labels.field_pinning.title",
      "settings_labels.field_pinning.view_by_media",
      "settings_labels.field_pinning.view_by_tags"
    ]
  },
  {
    "key": "quick_tags",
    "icon": "mdi-tag-plus-outline",
    "elementId": "settings-quick-tags",
    "tab": "library",
    "titleKey": "settings_labels.library.quick_tags",
    "searchKeys": [
      "settings_labels.library.quick_tags"
    ]
  },
  {
    "key": "parse_library_tags",
    "icon": "mdi-tag-search-outline",
    "elementId": "settings-parse-library-tags",
    "tab": "library",
    "titleKey": "settings_labels.library.parse_library_tags",
    "searchKeys": [
      "settings_labels.database.refresh_status",
      "settings_labels.database.status_not_loaded",
      "settings_labels.library.parse_library_tags",
      "settings_labels.library.parse_library_tags_apply_all",
      "settings_labels.library.parse_library_tags_apply_done",
      "settings_labels.library.parse_library_tags_apply_done_text",
      "settings_labels.library.parse_library_tags_apply_global_tags",
      "settings_labels.library.parse_library_tags_apply_selected",
      "settings_labels.library.parse_library_tags_complete",
      "settings_labels.library.parse_library_tags_dialog_title",
      "settings_labels.library.parse_library_tags_hint",
      "settings_labels.library.parse_library_tags_match_precision",
      "settings_labels.library.parse_library_tags_match_precision_desc_balanced",
      "settings_labels.library.parse_library_tags_match_precision_desc_permissive",
      "settings_labels.library.parse_library_tags_match_precision_desc_strict",
      "settings_labels.library.parse_library_tags_match_precision_level_balanced",
      "settings_labels.library.parse_library_tags_match_precision_level_permissive",
      "settings_labels.library.parse_library_tags_match_precision_level_strict",
      "settings_labels.library.parse_library_tags_no_results",
      "settings_labels.library.parse_library_tags_progress",
      "settings_labels.library.parse_library_tags_selection_summary",
      "settings_labels.library.parse_library_tags_start",
      "settings_labels.library.parse_library_tags_status",
      "settings_labels.library.parse_library_tags_status_no_parser",
      "settings_labels.library.parse_library_tags_summary_assignments",
      "settings_labels.library.parse_library_tags_summary_media",
      "settings_labels.library.parse_library_tags_summary_tags",
      "settings_labels.library.parse_library_tags_tab_media",
      "settings_labels.library.parse_library_tags_tab_tags"
    ]
  },
  {
    "key": "bulk_paths",
    "icon": "mdi-find-replace",
    "elementId": "settings-bulk-paths",
    "tab": "maintenance",
    "titleKey": "settings_labels.tools.bulk_edit_paths",
    "searchKeys": [
      "settings_labels.tools.bulk_edit_paths",
      "settings_labels.tools.bulk_edit_paths_btn",
      "settings_labels.tools.case_sensitive",
      "settings_labels.tools.files_matched",
      "settings_labels.tools.no_files_found",
      "settings_labels.tools.path_current",
      "settings_labels.tools.path_new",
      "settings_labels.tools.replace_paths_count",
      "settings_labels.tools.replace_paths_done",
      "settings_labels.tools.replace_paths_hint",
      "settings_labels.tools.replace_paths_hint_use_case",
      "settings_labels.tools.search_for",
      "settings_labels.tools.search_paths_empty_hint",
      "settings_labels.tools.search_paths_failed",
      "settings_labels.tools.search_paths_prompt",
      "settings_labels.tools.total_files",
      "settings_labels.tools.update_with"
    ]
  },
  {
    "key": "folder_tags",
    "icon": "mdi-folder-multiple-outline",
    "elementId": "settings-folder-tags",
    "tab": "library",
    "titleKey": "settings_labels.tools.folder_tags",
    "searchKeys": [
      "settings_labels.tools.folder_tags",
      "settings_labels.tools.folder_tags_count",
      "settings_labels.tools.folder_tags_hint",
      "settings_labels.tools.folder_tags_manage_btn"
    ]
  },
  {
    "key": "watched_folders",
    "icon": "mdi-folder-eye-outline",
    "elementId": "settings-watched-folders",
    "tab": "connections",
    "titleKey": "settings_labels.tools.folders",
    "searchKeys": [
      "settings_labels.database.select_folder",
      "settings_labels.tools.add_excluded_path",
      "settings_labels.tools.add_excluded_paths",
      "settings_labels.tools.add_folder",
      "settings_labels.tools.adding_folder",
      "settings_labels.tools.editing_folder",
      "settings_labels.tools.excluded_path_invalid",
      "settings_labels.tools.excluded_path_need_root",
      "settings_labels.tools.excluded_path_paste",
      "settings_labels.tools.excluded_paths",
      "settings_labels.tools.excluded_paths_empty",
      "settings_labels.tools.excluded_paths_hint",
      "settings_labels.tools.excluded_paths_partial_invalid",
      "settings_labels.tools.excluded_paths_paste_hint",
      "settings_labels.tools.excludes_count",
      "settings_labels.tools.folder_name_optional",
      "settings_labels.tools.folders",
      "settings_labels.tools.folders_empty",
      "settings_labels.tools.folders_empty_hint",
      "settings_labels.tools.path_to_folder",
      "settings_labels.tools.paused",
      "settings_labels.tools.remove_watched_folder_confirm",
      "settings_labels.tools.rescan_folders",
      "settings_labels.tools.watch_folders",
      "settings_labels.tools.watch_folders_hint",
      "settings_labels.tools.watch_folders_scan_warning",
      "settings_labels.tools.watch_folders_slow_warning",
      "settings_labels.tools.watching",
      "settings_labels.tools.watching_summary"
    ]
  },
  {
    "key": "open_data_folder",
    "elementId": "settings-open-data-folder",
    "tab": "database",
    "titleKey": "settings_labels.tools.open_data_folder_btn",
    "searchKeys": [
      "settings_labels.tools.open_app_data_folder",
      "settings_labels.tools.open_data_folder_btn"
    ]
  },
  {
    "key": "databases",
    "icon": "mdi-database-outline",
    "elementId": "settings-databases",
    "tab": "database",
    "titleKey": "settings.groups.storage",
    "searchKeys": [
      "settings.groups.storage",
      "settings_labels.database.add_new_database",
      "settings_labels.database.adding_database",
      "settings_labels.database.copy_generated_cache",
      "settings_labels.database.copy_generated_cache_hint",
      "settings_labels.database.create_starter_meta",
      "settings_labels.database.create_starter_meta_hint",
      "settings_labels.database.created",
      "settings_labels.database.database_activated",
      "settings_labels.database.database_backups_count",
      "settings_labels.database.database_duplicated",
      "settings_labels.database.databases_hint",
      "settings_labels.database.duplicate_database",
      "settings_labels.database.duplicating_database",
      "settings_labels.database.duplicating_database_progress",
      "settings_labels.database.editing_database",
      "settings_labels.database.import_into_active",
      "settings_labels.database.import_library_confirm",
      "settings_labels.database.import_library_connection_lost",
      "settings_labels.database.import_library_done",
      "settings_labels.database.import_library_failed",
      "settings_labels.database.importing_library_progress"
    ]
  },
  {
    "key": "database_add",
    "elementId": "database_add",
    "tab": "database",
    "titleKey": "settings_labels.database.add_new_database",
    "searchKeys": [
      "settings.groups.storage",
      "settings_labels.database.add_new_database",
      "settings_labels.database.adding_database",
      "settings_labels.database.copy_generated_cache",
      "settings_labels.database.copy_generated_cache_hint",
      "settings_labels.database.create_starter_meta",
      "settings_labels.database.create_starter_meta_hint",
      "settings_labels.database.created",
      "settings_labels.database.database_activated",
      "settings_labels.database.database_backups_count",
      "settings_labels.database.database_duplicated",
      "settings_labels.database.databases_hint",
      "settings_labels.database.duplicate_database",
      "settings_labels.database.duplicating_database",
      "settings_labels.database.duplicating_database_progress",
      "settings_labels.database.editing_database",
      "settings_labels.database.import_into_active",
      "settings_labels.database.import_library_confirm",
      "settings_labels.database.import_library_connection_lost",
      "settings_labels.database.import_library_done",
      "settings_labels.database.import_library_failed",
      "settings_labels.database.importing_library_progress"
    ]
  },
  {
    "key": "backups",
    "icon": "mdi-backup-restore",
    "elementId": "database_backups",
    "tab": "database",
    "titleKey": "settings_labels.database.manage_backups",
    "searchKeys": [
      "settings_labels.database.backup_latest",
      "settings_labels.database.backup_size_mb",
      "settings_labels.database.backups_empty_hint",
      "settings_labels.database.backups_hint",
      "settings_labels.database.backups_management",
      "settings_labels.database.backups_selected",
      "settings_labels.database.backups_sort_date",
      "settings_labels.database.backups_sort_size",
      "settings_labels.database.create_backup",
      "settings_labels.database.delete_backup",
      "settings_labels.database.delete_confirm",
      "settings_labels.database.export_backup",
      "settings_labels.database.failed_export_backup",
      "settings_labels.database.failed_import_backup",
      "settings_labels.database.file_missing",
      "settings_labels.database.folder_missing",
      "settings_labels.database.import_backup",
      "settings_labels.database.import_backup_started",
      "settings_labels.database.import_backup_success",
      "settings_labels.database.manage_backups",
      "settings_labels.database.native_picker_unavailable",
      "settings_labels.database.no_backups",
      "settings_labels.database.path_to_backup",
      "settings_labels.database.path_to_folder",
      "settings_labels.database.restore_backup",
      "settings_labels.database.restore_busy",
      "settings_labels.database.restore_complete",
      "settings_labels.database.restore_confirm",
      "settings_labels.database.restore_in_progress",
      "settings_labels.database.select_backup",
      "settings_labels.database.select_folder"
    ]
  },
  {
    "key": "library_reset",
    "icon": "mdi-database-remove-outline",
    "elementId": "settings-library-reset",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.library_reset",
    "searchKeys": [
      "settings_labels.database.library_reset",
      "settings_labels.database.library_reset_all_media",
      "settings_labels.database.library_reset_all_tags",
      "settings_labels.database.library_reset_complete_media",
      "settings_labels.database.library_reset_complete_media_permanent",
      "settings_labels.database.library_reset_complete_tags",
      "settings_labels.database.library_reset_complete_tags_permanent",
      "settings_labels.database.library_reset_confirm_all_media",
      "settings_labels.database.library_reset_confirm_all_tags",
      "settings_labels.database.library_reset_confirm_category",
      "settings_labels.database.library_reset_confirm_media_type",
      "settings_labels.database.library_reset_failed",
      "settings_labels.database.library_reset_hint",
      "settings_labels.database.library_reset_media",
      "settings_labels.database.library_reset_not_trash",
      "settings_labels.database.library_reset_phrase_all_media",
      "settings_labels.database.library_reset_phrase_all_tags",
      "settings_labels.database.library_reset_progress",
      "settings_labels.database.library_reset_stopped",
      "settings_labels.database.library_reset_tags",
      "settings_labels.database.library_reset_task_media",
      "settings_labels.database.library_reset_task_tags",
      "settings_labels.database.library_reset_type_to_confirm"
    ]
  },
  {
    "key": "library_health_guide",
    "icon": "mdi-clipboard-pulse-outline",
    "elementId": "settings-library-health-guide",
    "tab": "maintenance",
    "titleKey": "settings.groups.maintenance_health",
    "searchKeys": [
      "settings_labels.database.health_guide_clip_model_needed",
      "settings_labels.database.health_guide_done",
      "settings_labels.database.health_guide_eta",
      "settings_labels.database.health_guide_eta_left",
      "settings_labels.database.health_guide_hint",
      "settings_labels.database.health_guide_next",
      "settings_labels.database.health_guide_optional",
      "settings_labels.database.health_guide_pending",
      "settings_labels.database.health_guide_run_phase",
      "settings_labels.database.health_guide_running",
      "settings_labels.database.health_guide_steps_progress",
      "settings_labels.database.health_guide_title"
    ]
  },
  {
    "key": "generate_video_images",
    "icon": "mdi-movie-open-outline",
    "elementId": "settings-generate-video-images",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.generate_video_images",
    "searchKeys": [
      "settings_labels.database.generate_video_images_api_unavailable",
      "settings_labels.database.health_guide_done",
      "settings_labels.database.health_guide_pending",
      "settings_labels.database.status_not_loaded"
    ]
  },
  {
    "key": "generate_image_thumbs",
    "icon": "mdi-image-outline",
    "elementId": "settings-generate-image-thumbs",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.generate_image_thumbs",
    "searchKeys": [
      "settings_labels.database.generate_video_images_api_unavailable",
      "settings_labels.database.health_guide_done",
      "settings_labels.database.health_guide_pending",
      "settings_labels.database.status_not_loaded"
    ]
  },
  {
    "key": "generate_auto_chapters",
    "icon": "mdi-bookmark-multiple-outline",
    "elementId": "settings-generate-auto-chapters",
    "tab": "processing",
    "titleKey": "settings_labels.database.generate_auto_chapters",
    "searchKeys": [
      "settings_labels.database.generate_auto_chapters",
      "settings_labels.database.generate_auto_chapters_api_unavailable",
      "settings_labels.database.generate_auto_chapters_complete",
      "settings_labels.database.generate_auto_chapters_hint",
      "settings_labels.database.generate_auto_chapters_progress",
      "settings_labels.database.generate_auto_chapters_regenerate",
      "settings_labels.database.generate_auto_chapters_start",
      "settings_labels.database.generate_auto_chapters_status"
    ]
  },
  {
    "key": "tag_image_ai_upscale",
    "icon": "mdi-image-auto-adjust",
    "elementId": "settings-tag-image-ai-upscale",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.tag_image_ai_upscale",
    "searchKeys": [
      "settings_labels.database.health_guide_pending",
      "settings_labels.database.status_not_loaded",
      "settings_labels.database.tag_image_ai_upscale",
      "settings_labels.database.tag_image_ai_upscale_api_unavailable",
      "settings_labels.database.tag_image_ai_upscale_cleanup",
      "settings_labels.database.tag_image_ai_upscale_complete",
      "settings_labels.database.tag_image_ai_upscale_confirm",
      "settings_labels.database.tag_image_ai_upscale_downloading",
      "settings_labels.database.tag_image_ai_upscale_hint",
      "settings_labels.database.tag_image_ai_upscale_processing",
      "settings_labels.database.tag_image_ai_upscale_progress",
      "settings_labels.database.tag_image_ai_upscale_progress_eta",
      "settings_labels.database.tag_image_ai_upscale_start",
      "settings_labels.database.tag_image_ai_upscale_status"
    ]
  },
  {
    "key": "marker_moments",
    "icon": "mdi-image-search-outline",
    "elementId": "settings-marker-moments",
    "tab": "processing",
    "titleKey": "marker_moments.title",
    "searchKeys": ["marker_moments.enable", "marker_moments.settings_hint", "marker_moments.auto_refresh"]
  },
  {
    "key": "local_ai",
    "icon": "mdi-robot-outline",
    "elementId": "settings-local-ai",
    "tab": "processing",
    "titleKey": "settings_labels.local_ai.title",
    "searchKeys": [
      "settings.path_parser.statuses.disabled",
      "settings_labels.database.refresh_status",
      "settings_labels.local_ai.delete_confirm",
      "settings_labels.local_ai.delete_done",
      "settings_labels.local_ai.delete_model",
      "settings_labels.local_ai.download",
      "settings_labels.local_ai.download_confirm",
      "settings_labels.local_ai.download_done",
      "settings_labels.local_ai.downloading",
      "settings_labels.local_ai.enable",
      "settings_labels.local_ai.enable_hint",
      "settings_labels.local_ai.enable_hint_off",
      "settings_labels.local_ai.enable_now",
      "settings_labels.local_ai.hint",
      "settings_labels.local_ai.how_to_chat",
      "settings_labels.local_ai.how_to_docs",
      "settings_labels.local_ai.how_to_filters",
      "settings_labels.local_ai.how_to_regex",
      "settings_labels.local_ai.how_to_title",
      "settings_labels.local_ai.needs_enable",
      "settings_labels.local_ai.needs_enable_title",
      "settings_labels.local_ai.open_chat",
      "settings_labels.local_ai.status",
      "settings_labels.local_ai.status_disabled_downloaded",
      "settings_labels.local_ai.title"
    ],
    "localAi": true
  },
  {
    "key": "detect_faces",
    "icon": "mdi-face-recognition",
    "elementId": "settings-detect-faces",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.face_workflow_title",
    "searchKeys": [
      "settings.path_parser.statuses.downloaded",
      "settings_labels.database.detect_faces",
      "settings_labels.database.detect_faces_api_unavailable",
      "settings_labels.database.detect_faces_model_failed",
      "settings_labels.database.detect_faces_progress",
      "settings_labels.database.detect_faces_regenerate",
      "settings_labels.database.detect_faces_start",
      "settings_labels.database.detect_faces_status",
      "settings_labels.database.face_auto_blind_tags",
      "settings_labels.database.face_auto_blind_tags_hint",
      "settings_labels.database.face_auto_blind_tags_need_category",
      "settings_labels.database.face_detect_frames",
      "settings_labels.database.face_detect_frames_hint",
      "settings_labels.database.face_detect_gender",
      "settings_labels.database.face_detect_gender_hint",
      "settings_labels.database.face_detect_strictness",
      "settings_labels.database.face_detect_strictness_hint",
      "settings_labels.database.face_match_after_detect",
      "settings_labels.database.face_match_after_detect_hint",
      "settings_labels.database.face_match_candidates",
      "settings_labels.database.face_match_candidates_hint",
      "settings_labels.database.face_match_confidence",
      "settings_labels.database.face_match_confidence_hint",
      "settings_labels.database.face_match_embed_failed",
      "settings_labels.database.face_match_enroll",
      "settings_labels.database.face_match_enroll_force",
      "settings_labels.database.face_match_enroll_progress",
      "settings_labels.database.face_match_enrollment_quality",
      "settings_labels.database.face_match_mode",
      "settings_labels.database.face_match_mode_hint",
      "settings_labels.database.face_match_performer_meta",
      "settings_labels.database.face_match_performer_meta_placeholder",
      "settings_labels.database.face_match_reference_tips",
      "settings_labels.database.face_match_reference_tips_title",
      "settings_labels.database.face_match_run",
      "settings_labels.database.face_match_run_progress",
      "settings_labels.database.face_workflow_advanced",
      "settings_labels.database.face_workflow_download_models",
      "settings_labels.database.face_workflow_intro",
      "settings_labels.database.face_workflow_next_category_text",
      "settings_labels.database.face_workflow_next_category_title",
      "settings_labels.database.face_workflow_next_detect_text",
      "settings_labels.database.face_workflow_next_detect_title",
      "settings_labels.database.face_workflow_next_enroll_text",
      "settings_labels.database.face_workflow_next_enroll_title",
      "settings_labels.database.face_workflow_next_match_text",
      "settings_labels.database.face_workflow_next_match_title",
      "settings_labels.database.face_workflow_next_models_text",
      "settings_labels.database.face_workflow_next_models_title",
      "settings_labels.database.face_workflow_next_performers_text",
      "settings_labels.database.face_workflow_next_performers_title",
      "settings_labels.database.face_workflow_ready_text",
      "settings_labels.database.face_workflow_ready_title",
      "settings_labels.database.face_workflow_step1_done",
      "settings_labels.database.face_workflow_step1_text",
      "settings_labels.database.face_workflow_step1_title",
      "settings_labels.database.face_workflow_step3_done",
      "settings_labels.database.face_workflow_step3_text",
      "settings_labels.database.face_workflow_step3_title",
      "settings_labels.database.face_workflow_step4_text",
      "settings_labels.database.face_workflow_step4_title",
      "settings_labels.database.face_workflow_step5_done",
      "settings_labels.database.face_workflow_step5_text",
      "settings_labels.database.face_workflow_step5_title",
      "settings_labels.database.face_workflow_title",
      "settings_labels.database.health_guide_done",
      "settings_labels.database.health_guide_pending"
    ]
  },
  {
    "key": "find_missing",
    "icon": "mdi-file-search-outline",
    "elementId": "settings-find-missing-media",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.find_missing_media",
    "searchKeys": [
      "settings_labels.database.find_missing_media",
      "settings_labels.database.find_missing_media_complete",
      "settings_labels.database.find_missing_media_hint",
      "settings_labels.database.find_missing_media_match_hash",
      "settings_labels.database.find_missing_media_match_size",
      "settings_labels.database.find_missing_media_paths_label",
      "settings_labels.database.find_missing_media_phase_loading",
      "settings_labels.database.find_missing_media_phase_scanning",
      "settings_labels.database.find_missing_media_progress",
      "settings_labels.database.find_missing_media_relink",
      "settings_labels.database.find_missing_media_relink_done",
      "settings_labels.database.find_missing_media_relink_done_text",
      "settings_labels.database.find_missing_media_start",
      "settings_labels.database.find_missing_media_status",
      "settings_labels.database.find_missing_media_status_not_loaded",
      "settings_labels.database.refresh_status",
      "settings_labels.database.status_not_loaded"
    ]
  },
  {
    "key": "find_duplicates",
    "icon": "mdi-content-duplicate",
    "elementId": "settings-find-duplicates",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.find_duplicates",
    "searchKeys": [
      "duplicateSimilarity.searchHint",
      "duplicateSimilarity.searchTitle",
      "duplicateSimilarity.sectionHint",
      "settings_labels.database.find_duplicates",
      "settings_labels.database.find_duplicates_media_type",
      "settings_labels.database.find_duplicates_mode",
      "settings_labels.database.find_duplicates_open"
    ]
  },
  {
    "key": "copy_discovery",
    "icon": "mdi-folder-search-outline",
    "elementId": "settings-copy-discovery",
    "tab": "maintenance",
    "titleKey": "duplicateSimilarity.foldersTitle",
    "searchKeys": [
      "copyDiscovery.title",
      "duplicateSimilarity.foldersHint",
      "duplicateSimilarity.foldersTitle"
    ]
  },
  {
    "key": "duplicate_options",
    "icon": "mdi-tune-variant",
    "elementId": "settings-duplicate-options",
    "tab": "maintenance",
    "titleKey": "maintenanceView.duplicateOptions",
    "searchKeys": [
      "copies.full_verification",
      "duplicateSimilarity.afterMerge",
      "duplicateSimilarity.autoHint",
      "duplicateSimilarity.autoMerge",
      "duplicateSimilarity.custom",
      "duplicateSimilarity.discoveryHint",
      "duplicateSimilarity.discoveryTitle",
      "duplicateSimilarity.guarantee",
      "duplicateSimilarity.invalid",
      "duplicateSimilarity.minimumFrames",
      "duplicateSimilarity.moreMatches",
      "duplicateSimilarity.onFolder",
      "duplicateSimilarity.onFolderHint",
      "duplicateSimilarity.onImport",
      "duplicateSimilarity.onImportHint",
      "duplicateSimilarity.onReconnect",
      "duplicateSimilarity.onReconnectHint",
      "duplicateSimilarity.original",
      "duplicateSimilarity.otherFiles",
      "duplicateSimilarity.overrideShort",
      "duplicateSimilarity.presetFingerprint",
      "duplicateSimilarity.presetVisual",
      "duplicateSimilarity.required",
      "duplicateSimilarity.save",
      "duplicateSimilarity.saveFailed",
      "duplicateSimilarity.scoreHint",
      "duplicateSimilarity.shaHint",
      "duplicateSimilarity.signals",
      "duplicateSimilarity.stricter",
      "duplicateSimilarity.subtitle",
      "duplicateSimilarity.threshold",
      "duplicateSimilarity.thresholdLabel",
      "duplicateSimilarity.title",
      "duplicateSimilarity.verificationHint",
      "duplicateSimilarity.verificationTitle",
      "duplicateSimilarity.visualMinimum",
      "duplicateSimilarity.weight",
      "duplicateSimilarity.weightHint"
    ]
  },
  {
    "key": "clear_generated",
    "icon": "mdi-delete-sweep",
    "elementId": "settings-clear-generated-images",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.clear_generated_images",
    "searchKeys": [
      "settings_labels.database.calculate_sizes",
      "settings_labels.database.clear_generated_images",
      "settings_labels.database.clear_generated_images_confirm",
      "settings_labels.database.clear_generated_images_hint",
      "settings_labels.database.clear_generated_images_total",
      "settings_labels.database.folder_size_load_failed",
      "settings_labels.database.folder_size_unknown",
      "settings_labels.database.health_guide_optional"
    ]
  },
  {
    "key": "plugins_list",
    "elementId": "settings-plugins",
    "tab": "plugins",
    "titleKey": "settings.tabs.plugins",
    "searchKeys": [
      "settings_labels.plugins.download_alert",
      "settings_labels.plugins.download_button",
      "settings_labels.plugins.empty_installed",
      "settings_labels.plugins.empty_installed_hint",
      "settings_labels.plugins.enabled",
      "settings_labels.plugins.install_how_1",
      "settings_labels.plugins.install_how_2",
      "settings_labels.plugins.install_how_3",
      "settings_labels.plugins.install_how_title",
      "settings_labels.plugins.install_zip",
      "settings_labels.plugins.permissions_label",
      "settings_labels.plugins.section_installed",
      "settings_labels.plugins.stats_enabled",
      "settings_labels.plugins.stats_installed",
      "settings_labels.plugins.uninstall",
      "settings_labels.plugins.version"
    ]
  },
  {
    "key": "registration",
    "icon": "mdi-key-variant",
    "elementId": "settings-registration",
    "tab": "about",
    "titleKey": "registration.activation_key",
    "searchKeys": [
      "registration.activation_key",
      "registration.activations_exceeded",
      "registration.application_not_registered",
      "registration.application_registered",
      "registration.back_to_entering_key",
      "registration.buy_lifetime_key",
      "registration.check_key_status",
      "registration.deactivate_confirm",
      "registration.deactivate_on_device",
      "registration.deactivate_other_devices",
      "registration.deactivate_other_devices_confirm",
      "registration.deactivate_other_devices_none",
      "registration.deactivate_other_devices_success",
      "registration.deactivation_already_inactive",
      "registration.deactivation_failed",
      "registration.deactivation_successful",
      "registration.enter_activation_key",
      "registration.enter_another_key",
      "registration.entering_key",
      "registration.expiration_date",
      "registration.internet_error_checking_key",
      "registration.key",
      "registration.key_expired",
      "registration.key_not_found",
      "registration.key_required",
      "registration.key_status",
      "registration.license_source",
      "registration.microsoft_store",
      "registration.no_activation_key_found",
      "registration.register_app",
      "registration.registration",
      "registration.registration_failed",
      "registration.registration_successful",
      "registration.status",
      "registration.store_licensed",
      "registration.store_licensed_hint",
      "registration.used_devices"
    ]
  },
  {
    "key": "about",
    "elementId": "settings-about",
    "tab": "about",
    "titleKey": "settings.tabs.about",
    "searchKeys": []
  },
  {
    "key": "sources",
    "icon": "mdi-server-network-outline",
    "keywords": ["Google Drive", "Dropbox", "OneDrive", "OAuth", "Client ID", "App key", "Client secret", "Redirect URI"],
    "elementId": "settings-sources",
    "tab": "connections",
    "titleKey": "settingsLayout.connections",
    "searchKeys": [
      "nas.import_selected",
      "nas.title",
      "sources.provider",
      "sources.title"
    ]
  },
  {
    "key": "metadata_transfer",
    "icon": "mdi-file-export-outline",
    "elementId": "settings-metadata-transfer",
    "tab": "connections",
    "titleKey": "metadata_transfer.title",
    "searchKeys": [
      "metadata_transfer.apply",
      "metadata_transfer.blocked",
      "metadata_transfer.choose_file",
      "metadata_transfer.conflicts",
      "metadata_transfer.current",
      "metadata_transfer.download",
      "metadata_transfer.export",
      "metadata_transfer.export_done",
      "metadata_transfer.export_hint",
      "metadata_transfer.failed",
      "metadata_transfer.file_exists",
      "metadata_transfer.import",
      "metadata_transfer.import_done",
      "metadata_transfer.import_hint",
      "metadata_transfer.incoming",
      "metadata_transfer.invalid_format",
      "metadata_transfer.keep",
      "metadata_transfer.keep_all",
      "metadata_transfer.mapping_hint",
      "metadata_transfer.new_file",
      "metadata_transfer.no_conflicts",
      "metadata_transfer.preview_paths",
      "metadata_transfer.refresh_failed",
      "metadata_transfer.refresh_preview",
      "metadata_transfer.replace",
      "metadata_transfer.replace_all",
      "metadata_transfer.resolution",
      "metadata_transfer.sidecars",
      "metadata_transfer.sidecars_done",
      "metadata_transfer.sidecars_hint",
      "metadata_transfer.summary",
      "metadata_transfer.title",
      "metadata_transfer.too_large",
      "metadata_transfer.write_sidecars"
    ]
  },
  {
    "key": "change_history",
    "icon": "mdi-history",
    "elementId": "settings-change-history",
    "tab": "database",
    "titleKey": "change_history.title",
    "searchKeys": [
      "change_history.after",
      "change_history.before",
      "change_history.bulk_source",
      "change_history.conflict",
      "change_history.details",
      "change_history.empty",
      "change_history.empty_title",
      "change_history.empty_value",
      "change_history.error",
      "change_history.fields_label",
      "change_history.items_label",
      "change_history.loading",
      "change_history.more",
      "change_history.no_value",
      "change_history.operations",
      "change_history.protection_hint",
      "change_history.refresh",
      "change_history.remaining_label",
      "change_history.restore_source",
      "change_history.restored",
      "change_history.success",
      "change_history.summary",
      "change_history.title",
      "change_history.undo_hint",
      "change_history.undo_operation",
      "change_history.workspace_hint"
    ]
  },
  {
    "key": "fingerprint_backfill",
    "icon": "mdi-fingerprint",
    "elementId": "settings-fingerprint-backfill",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.fingerprint_backfill",
    "searchKeys": [
      "settings_labels.database.fingerprint_backfill",
      "settings_labels.database.fingerprint_backfill_hint",
      "settings_labels.database.fingerprint_backfill_status",
      "settings_labels.database.fingerprint_backfill_start",
      "settings_labels.database.fingerprint_backfill_recalculate",
      "settings_labels.database.fingerprint_backfill_missing_hint",
      "settings_labels.database.fingerprint_backfill_progress",
      "settings_labels.database.fingerprint_backfill_complete",
      "settings_labels.database.remote_oshash_background",
      "settings_labels.database.remote_oshash_background_hint"
    ]
  },
  {
    "key": "visual_hash_backfill",
    "icon": "mdi-image-multiple",
    "elementId": "settings-visual-hash-backfill",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.visual_hash_backfill",
    "searchKeys": [
      "settings_labels.database.visual_hash_backfill",
      "settings_labels.database.visual_hash_backfill_hint",
      "settings_labels.database.visual_hash_backfill_status",
      "settings_labels.database.visual_hash_backfill_start",
      "settings_labels.database.visual_hash_backfill_recalculate",
      "settings_labels.database.visual_hash_backfill_missing_hint",
      "settings_labels.database.visual_hash_backfill_progress",
      "settings_labels.database.visual_hash_backfill_complete"
    ]
  },
  {
    "key": "video_codec_backfill",
    "icon": "mdi-movie-filter",
    "elementId": "settings-video-codec-backfill",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.video_codec_backfill",
    "searchKeys": [
      "settings_labels.database.video_codec_backfill",
      "settings_labels.database.video_codec_backfill_hint",
      "settings_labels.database.video_codec_backfill_status",
      "settings_labels.database.video_codec_backfill_start",
      "settings_labels.database.video_codec_backfill_recalculate",
      "settings_labels.database.video_codec_backfill_missing_hint",
      "settings_labels.database.video_codec_backfill_progress",
      "settings_labels.database.video_codec_backfill_complete"
    ]
  },
  {
    "key": "media_created_backfill",
    "icon": "mdi-calendar-star",
    "elementId": "settings-media-created-backfill",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.media_created_backfill",
    "searchKeys": [
      "settings_labels.database.media_created_backfill",
      "settings_labels.database.media_created_backfill_hint",
      "settings_labels.database.media_created_backfill_status",
      "settings_labels.database.media_created_backfill_start",
      "settings_labels.database.media_created_backfill_recalculate",
      "settings_labels.database.media_created_backfill_missing_hint",
      "settings_labels.database.media_created_backfill_progress",
      "settings_labels.database.media_created_backfill_complete"
    ]
  },
  {
    "key": "clip_embedding_backfill",
    "icon": "mdi-brain",
    "elementId": "settings-clip-embedding-backfill",
    "tab": "maintenance",
    "titleKey": "settings_labels.database.clip_embedding_backfill",
    "searchKeys": [
      "settings_labels.database.clip_embedding_backfill",
      "settings_labels.database.clip_embedding_backfill_hint",
      "settings_labels.database.clip_embedding_backfill_status",
      "settings_labels.database.clip_embedding_backfill_start",
      "settings_labels.database.clip_embedding_backfill_recalculate",
      "settings_labels.database.clip_embedding_backfill_missing_hint",
      "settings_labels.database.clip_embedding_backfill_progress",
      "settings_labels.database.clip_embedding_backfill_complete"
    ]
  },
  {
    "key": "behavior",
    "elementId": "settings-behavior",
    "tab": "general",
    "titleKey": "settings_labels.general.group_behavior",
    "searchKeys": [
      "settings_labels.general.startup_health_notifications",
      "settings_labels.general.startup_health_notifications_hint",
      "settings_labels.general.minimize_to_tray",
      "settings_labels.general.minimize_to_tray_hint"
    ]
  },
  {
    "key": "google_drive",
    "icon": "mdi-cloud-outline",
    "elementId": "settings-google-drive",
    "tab": "connections",
    "titleKey": "settingsLayout.google_drive",
    "searchKeys": []
  },
  {
    "key": "nas",
    "icon": "mdi-server-network-outline",
    "keywords": ["NAS", "SFTP", "FTP", "FTPS"],
    "elementId": "settings-nas",
    "tab": "connections",
    "titleKey": "nas.title",
    "searchKeys": [
      "nas.scanning",
      "nas.scan_stopped",
      "nas.select_all",
      "nas.clear_selection",
      "nas.select_file",
      "nas.selected_count",
      "nas.import_selected",
      "nas.import_visible",
      "nas.batch_counts",
      "nas.retry_remaining",
      "nas.batch_progress",
      "nas.stop_import",
      "nas.stopping",
      "nas.batch_errors",
      "nas.batch_summary",
      "nas.batch_stopped",
      "nas.batch_retry",
      "nas.playback_error",
      "nas.title",
      "nas.protocol",
      "nas.connection",
      "nas.add_connection",
      "nas.credentials",
      "nas.disconnect",
      "nas.disconnected",
      "nas.parent",
      "nas.refresh",
      "nas.truncated",
      "nas.import_play",
      "nas.preview_play",
      "nas.empty",
      "nas.name",
      "nas.host",
      "nas.port",
      "nas.username",
      "nas.password",
      "nas.password_saved",
      "nas.password_keep_hint",
      "nas.private_key_keep_hint",
      "nas.show_password",
      "nas.hide_password",
      "nas.root",
      "nas.webdav_hint",
      "nas.root_hint",
      "nas.auth",
      "nas.private_key",
      "nas.passphrase",
      "nas.ftp_hint",
      "nas.trust_hint",
      "nas.trust_connect",
      "nas.connect",
      "nas.cancel",
      "nas.invalid",
      "nas.error",
      "nas.added",
      "nas.already_added",
      "nas.errors.tls_error",
      "nas.errors.invalid_response",
      "nas.errors.range_not_supported",
      "nas.errors.host_key_required",
      "nas.errors.host_key_changed",
      "nas.errors.credentials_required",
      "nas.errors.connection_failed",
      "nas.errors.connection_closed",
      "nas.errors.connection_identity",
      "nas.errors.file_changed",
      "nas.errors.in_trash",
      "nas.errors.outside_root",
      "nas.errors.location_not_found",
      "nas.errors.expired_session",
      "nas.errors.not_found",
      "nas.errors.library_changed",
      "nas.errors.unsupported_format"
    ]
  },
  {
    "key": "filtering",
    "elementId": "settings-filtering",
    "tab": "general",
    "titleKey": "settings_labels.general.exact_filtering",
    "searchKeys": [
      "settings_labels.general.exact_filtering",
      "settings_labels.general.typing",
      "settings_labels.general.result"
    ]
  }
]

const SECTION_ALIASES: Record<string, string> = {oshash_backfill: 'fingerprint_backfill', content_hash_backfill: 'fingerprint_backfill'}
const TAB_ALIASES: Record<string, string> = {
  tools: 'general', meta: 'library', media: 'library', assignment: 'library',
  video: 'viewing', files: 'connections', data_scraper: 'plugins', adult: 'plugins',
}
const PLUGIN_SECTIONS = new Set([
  'settings-import-plex', 'settings-import-emby', 'settings-import-jellyfin',
  'settings-import-stash', 'settings-adult-scraper', 'settings-tmdb',
])

export function settingsPanelTab(_panel: Pick<PluginSettingsPanelContribution, 'tab' | 'sectionId'>): string {
  return 'plugins'
}

export function resolveSettingsLocation(tab = 'general', section = '', panels: PluginSettingsPanelContribution[] = []) {
  const canonical = SECTION_ALIASES[section] || section
  const entry = SETTINGS_SECTIONS.find(item => item.key === canonical || item.elementId === section)
  if (entry) return {tab: entry.tab, elementId: entry.elementId}
  // Legacy provider and scraper section keys predate plugin panel contributions.
  if (section === 'google_drive' || section === 'nas') return {tab: 'connections', elementId: `settings-${section === 'google_drive' ? 'google-drive' : 'nas'}`}
  if (section === 'adult_scraper') return {tab: 'plugins', elementId: 'settings-adult-scraper'}
  if (PLUGIN_SECTIONS.has(section)) return {tab: 'plugins', elementId: section}
  const panel = panels.find(panel => panel.sectionId === section)
  if (panel) return {tab: settingsPanelTab(panel), elementId: panel.sectionId}
  return {tab: TAB_ALIASES[tab] || tab, elementId: undefined}
}

export const normalizeSettingsSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/ё/g, 'е')

export function searchSettings(items: SettingsSearchItem[], query: string) {
  const normalize = normalizeSettingsSearch
  const words = normalize(query).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return items.filter(item => {
    const text = normalize([item.title, item.category, ...item.terms].join(' '))
    return words.every(word => text.includes(word))
  }).sort((a, b) => Number(normalize(b.title).includes(normalize(query).trim())) - Number(normalize(a.title).includes(normalize(query).trim())))
}

/** Plain text segments keep highlighting safe for translated and plugin-provided labels. */
export function highlightSettingsMatch(text: string, query: string): Array<{text: string; matched: boolean}> {
  const words = normalizeSettingsSearch(query).trim().split(/\s+/).filter(Boolean)
  const positions: Array<{start: number; end: number}> = []
  let normalized = ''
  let offset = 0
  for (const char of text) {
    const part = normalizeSettingsSearch(char)
    for (let i = 0; i < part.length; i++) positions.push({start: offset, end: offset + char.length})
    normalized += part
    offset += char.length
  }
  const matched = new Array<boolean>(text.length).fill(false)
  for (const word of words) {
    let start = normalized.indexOf(word)
    while (start !== -1) {
      const first = positions[start]!
      const last = positions[start + word.length - 1]!
      matched.fill(true, first.start, last.end)
      start = normalized.indexOf(word, start + 1)
    }
  }
  const segments: Array<{text: string; matched: boolean}> = []
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1]
    if (last && last.matched === matched[i]) last.text += text[i]
    else segments.push({text: text[i]!, matched: matched[i]!})
  }
  return segments
}

/** Prefer the description matching the most query words, rather than the first partial hit. */
export function settingsMatchContext(item: SettingsSearchItem, query: string): string {
  const words = normalizeSettingsSearch(query).trim().split(/\s+/).filter(Boolean)
  const displayedLabels = [item.title, item.category].map(label => normalizeSettingsSearch(label).trim())
  let context = ''
  let bestScore = 0
  for (const term of item.terms) {
    const normalized = normalizeSettingsSearch(term).trim()
    if (displayedLabels.includes(normalized)) continue
    const score = words.filter(word => normalized.includes(word)).length
    if (score > bestScore) { context = term; bestScore = score }
  }
  return context
}

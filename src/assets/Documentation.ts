export const docs = [
  {
    id: 'app',
    name: 'Application',
    icon: 'mdi-application-outline',
    children: [
      { id: 'app.first_launch', name: 'First launch', icon: 'mdi-flag' },
      { id: 'app.core_concepts', name: 'Core concepts', icon: 'mdi-lightbulb-outline' },
    ],
  },
  {
    id: 'ui',
    name: 'User interface',
    icon: 'mdi-view-quilt',
    children: [
      {
        id: 'ui.menu',
        name: 'Menu',
        icon: 'mdi-menu',
        selector: ['.v-navigation-drawer .v-list', '.bottom-menu'],
      },
      {
        id: 'ui.useToolbarStore',
        name: 'Toolbar',
        icon: 'mdi-view-compact',
        selector: ['.v-app-bar'],
      },
      { id: 'ui.tabs', name: 'Tabs', icon: 'mdi-tab' },
      { id: 'ui.filters', name: 'Filters', icon: 'mdi-filter-outline' },
      { id: 'ui.selection', name: 'Selection mode', icon: 'mdi-checkbox-marked-outline' },
    ],
  },
  {
    id: 'media',
    name: 'Media library',
    icon: 'mdi-file-outline',
    selector: ['[href*="/media"]'],
    children: [
      { id: 'media.adding', name: 'Adding media', icon: 'mdi-file-plus-outline' },
      { id: 'media.parser', name: 'Path tag parser', icon: 'mdi-text-box-search' },
      { id: 'media.video_object_recognition', name: 'Video object recognition', icon: 'mdi-image-search-outline' },
      { id: 'media.view', name: 'View and sorting', icon: 'mdi-view-grid-outline' },
      { id: 'media.file_paths', name: 'File paths', icon: 'mdi-file-tree-outline' },
    ],
  },
  {
    id: 'tags',
    name: 'Tags',
    icon: 'mdi-tag-multiple',
    selector: ['.item-tag', '.item .v-chip'],
    children: [
      { id: 'tags.categories', name: 'Tag categories', icon: 'mdi-shape-outline' },
      { id: 'tags.tag_page', name: 'Tag page', icon: 'mdi-tag-outline' },
    ],
  },
  {
    id: 'meta',
    name: 'Custom metadata',
    icon: 'mdi-shape',
    selector: ['[href*="/meta"]'],
    children: [
      {
        id: 'meta.assign',
        name: 'Pin metadata fields',
        icon: 'mdi-pin',
        selector: ['[href*="/settings"]', '#settings-meta-assignment'],
      },
    ],
  },
  {
    id: 'meta_types',
    name: 'Field types',
    icon: 'mdi-shape-plus',
    children: [
      { id: 'meta_types.tags', name: 'Tag category', icon: 'mdi-tag-multiple' },
      { id: 'meta_types.string', name: 'Text', icon: 'mdi-text' },
      { id: 'meta_types.number', name: 'Number', icon: 'mdi-numeric' },
      { id: 'meta_types.boolean', name: 'Checkbox', icon: 'mdi-checkbox-marked-outline' },
      { id: 'meta_types.rating', name: 'Rating', icon: 'mdi-star' },
      { id: 'meta_types.date', name: 'Date', icon: 'mdi-calendar' },
    ],
  },
  {
    id: 'playlists',
    name: 'Playlists',
    icon: 'mdi-format-list-bulleted',
    selector: ['[href="/playlists"]'],
    children: [
      { id: 'playlists.smart', name: 'Smart playlists', icon: 'mdi-filter-variant' },
      { id: 'playlists.manual', name: 'Manual playlists', icon: 'mdi-playlist-play' },
    ],
  },
  {
    id: 'markers',
    name: 'Markers',
    icon: 'mdi-tooltip-outline',
    selector: ['[href="/markers"]'],
  },
  {
    id: 'player',
    name: 'Video Player',
    icon: 'mdi-play-circle',
    children: [
      { id: 'player.formats', name: 'Supported formats', icon: 'mdi-file-video' },
      { id: 'player.hotkeys', name: 'Player hotkeys', icon: 'mdi-keyboard' },
      { id: 'player.marks_playlists', name: 'Marks and playlists', icon: 'mdi-playlist-play' },
    ],
  },
  {
    id: 'sets',
    name: 'Settings',
    icon: 'mdi-cog',
    selector: ['[href="/settings"]'],
    children: [
      {
        id: 'settings.general',
        name: 'General',
        icon: 'mdi-application-cog-outline',
        selector: ['[href="/settings"]', '#settings-doc-tab-general'],
        children: [
          { id: 'player.formats', name: 'Player', icon: 'mdi-play-circle' },
          {
            id: 'sets.tools.video_preview',
            name: 'Video preview',
            icon: 'mdi-image-area',
            selector: ['[href="/settings"]', '#video_preview'],
          },
        ],
      },
      {
        id: 'settings.appearance',
        name: 'Appearance',
        icon: 'mdi-brush-variant',
      },
      {
        id: 'settings.library',
        name: 'Library',
        icon: 'mdi-bookshelf',
        selector: ['[href="/settings"]', '#settings-doc-tab-library'],
        children: [
          { id: 'meta', name: 'Custom metadata', icon: 'mdi-shape-outline' },
          { id: 'media.types', name: 'Media types', icon: 'mdi-file-multiple-outline' },
          { id: 'meta.assign', name: 'Field pinning', icon: 'mdi-pin-outline' },
          {
            id: 'sets.tools.quick_tags',
            name: 'Quick tags',
            icon: 'mdi-tag-plus-outline',
            selector: ['[href="/settings"]', '#settings-quick-tags'],
          },
        ],
      },
      {
        id: 'settings.files',
        name: 'Files',
        icon: 'mdi-folder-cog-outline',
        selector: ['[href="/settings"]', '#settings-doc-tab-files'],
        children: [
          { id: 'sets.tools.bulk_paths', name: 'Bulk path editing', icon: 'mdi-find-replace' },
          { id: 'sets.tools.watched_folders', name: 'Watched folders', icon: 'mdi-folder-eye-outline' },
        ],
      },
      {
        id: 'database',
        name: 'Database',
        icon: 'mdi-database-outline',
        selector: ['[href="/settings"]', '#settings-doc-tab-database'],
        children: [
          {
            id: 'database.add',
            name: 'Adding a database',
            icon: 'mdi-plus',
            selector: ['#database_add', '[href="/settings"]'],
          },
          {
            id: 'database.backups',
            name: 'Manage backups',
            icon: 'mdi-database',
            selector: ['#database_backups', '[href="/settings"]'],
            children: [
              { id: 'database.backups.create', name: 'Creating backups', icon: 'mdi-database-plus' },
              { id: 'database.backups.restore', name: 'Restoring backups', icon: 'mdi-database-refresh' },
            ],
          },
          {
            id: 'database.fingerprint',
            name: 'Dedup fingerprints',
            icon: 'mdi-fingerprint',
            selector: ['[href="/settings"]', '#settings-fingerprint-backfill'],
          },
          { id: 'settings.files.find_missing', name: 'Find missing files', icon: 'mdi-file-search-outline' },
          {
            id: 'settings.files.generated_previews',
            name: 'Generated previews',
            icon: 'mdi-image-auto-adjust',
            selector: ['[href="/settings"]', '#settings-generate-video-images'],
          },
        ],
      },
      {
        id: 'settings.plugins',
        name: 'Plugins',
        icon: 'mdi-puzzle-outline',
        selector: ['[href="/settings"]', '#settings-doc-tab-plugins'],
        children: [
          {
            id: 'data_scraper',
            name: 'Data scraper',
            icon: 'mdi-search-web',
            selector: ['[href="/settings"]', '#settings-doc-tab-plugins'],
          },
        ],
      },
      { id: 'settings.about', name: 'About and registration', icon: 'mdi-information-outline' },
    ],
  },
]

export default docs

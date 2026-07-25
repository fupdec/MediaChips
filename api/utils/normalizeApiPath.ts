const API_SEGMENT_ALIASES = {
  bulkmeta: 'bulk-meta',
  filterrow: 'FilterRow',
  filterrowsinsavedfilter: 'FilterRowsInSavedFilter',
  home: 'home',
  mark: 'Mark',
  media: 'Media',
  mediainplaylists: 'MediaInPlaylists',
  mediatype: 'MediaType',
  mediatypesinwatchedfolders: 'MediaTypesInWatchedFolders',
  meta: 'Meta',
  metainmediatype: 'MetaInMediaType',
  metasetting: 'MetaSetting',
  pagesetting: 'PageSetting',
  pinnedmeta: 'PinnedMeta',
  playlist: 'Playlist',
  savedfilter: 'SavedFilter',
  setting: 'Setting',
  tab: 'Tab',
  tag: 'Tag',
  tagsinfilterrow: 'TagsInFilterRow',
  tagsinmedia: 'TagsInMedia',
  tagsinfolder: 'TagsInFolder',
  tagsintag: 'TagsInTag',
  task: 'Task',
  tasksbackups: 'TasksBackups',
  valuesinmedia: 'ValuesInMedia',
  valuesintag: 'ValuesInTag',
  videometadata: 'VideoMetadata',
  watchedfolder: 'WatchedFolder',
} as const

type ApiSegmentAliasKey = keyof typeof API_SEGMENT_ALIASES

function normalizeApiPath(url = ''): string {
  const match = url.match(/^\/api\/([^/?]+)(.*)$/i)
  if (!match) return url

  const segment = match[1]
  const rest = match[2]
  const aliasKey = segment.toLowerCase() as ApiSegmentAliasKey
  const canonical = API_SEGMENT_ALIASES[aliasKey]

  if (!canonical || segment === canonical) return url

  return `/api/${canonical}${rest}`
}

export { normalizeApiPath }

export const MARK_SORT_PARAMS = [
  { param: 'time', icon: 'clock-outline', textKey: 'markers.sort.time' },
  { param: 'videoName', icon: 'movie-open', textKey: 'markers.sort.video_name' },
  { param: 'tagName', icon: 'tag', textKey: 'markers.sort.tag_name' },
  { param: 'type', icon: 'shape', textKey: 'markers.sort.type' },
  { param: 'id', icon: 'identifier', textKey: 'markers.sort.id' },
  { param: 'shuffle', icon: 'shuffle-variant', textKey: 'markers.sort.shuffle' },
] as const

export const MARKS_PAGE_LIMIT = 24

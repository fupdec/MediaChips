export const GENERATED_MEDIA_FOLDERS = {
  thumbs: 'media/videos/thumbs',
  grids: 'media/videos/grids',
  marks: 'media/videos/marks',
  'image-thumbs': 'media/images/thumbs',
} as const

export type GeneratedMediaFolderKey = keyof typeof GENERATED_MEDIA_FOLDERS

export const GENERATED_MEDIA_FOLDER_KEYS = Object.keys(
  GENERATED_MEDIA_FOLDERS,
) as GeneratedMediaFolderKey[]

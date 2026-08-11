import type Database from 'better-sqlite3'
import { nowIso } from './utils/timestamps'
import { loadDefaultSettingsList } from '../utils/defaultSettings'

const IMAGE_EXTENSIONS = 'jpg,jpeg,bmp,png,webp,gif,tiff,tif,heic,avif,svg'

const DEFAULT_MEDIA_TYPES = [
  {
    type: 'video',
    name: 'Videos',
    icon: 'video-outline',
    extensions: 'avi,3gp,f4v,flv,m4v,mkv,mod,mov,mp4,mpeg,mpg,mts,rm,rmvb,swf,ts,vob,webm,wmv,yuv',
    custom: 0,
    hidden: 0,
    order: 1,
  },
  {
    type: 'image',
    name: 'Images',
    icon: 'image-outline',
    extensions: IMAGE_EXTENSIONS,
    custom: 0,
    hidden: 0,
    order: 2,
  },
  {
    type: 'audio',
    name: 'Audios',
    icon: 'music',
    extensions: 'mp3,m4a,wav,flac,ogg,aac,opus,wma',
    custom: 0,
    hidden: 1,
    order: 3,
  },
  {
    type: 'text',
    name: 'Texts',
    icon: 'sticker-text-outline',
    extensions: 'txt,doc,pdf,html',
    custom: 0,
    hidden: 1,
    order: 4,
  },
] as const

const MIGRATION_SETTINGS = [
  {option: 'ratingAndFavoriteInCard', value: '1'},
  {option: 'group_chips_in_card_description', value: '1'},
  {option: 'show_preset_metadata_in_card', value: '1'},
  {option: 'count_number_of_views', value: '1'},
  {option: 'system_dark_mode', value: '1'},
  {option: 'open_player_in_separate_window', value: '0'},
  {option: 'show_quick_action_button', value: '0'},
  {option: 'showPlaylistsInNavigation', value: '1'},
  {option: 'showMarkersInNavigation', value: '1'},
  {option: 'play_sound_on_video_preview', value: '0'},
  {option: 'big_video_preview', value: '1'},
  {option: 'big_video_preview_delay', value: '2000'},
  {option: 'big_video_preview_size', value: 'full_height'},
  {option: 'card_hover_meta_plate', value: '0'},
  {option: 'show_salutation', value: '1'},
  {option: 'show_ip_at_home_screen', value: '1'},
  {option: 'show_alert_new_tool_words', value: '1'},
  {option: 'startupHealthNotifications', value: '1'},
  {option: 'show_default_meta_outlined', value: '1'},
  {option: 'show_default_meta_label', value: '1'},
  {option: 'show_default_meta_filesize', value: '0'},
  {option: 'show_default_meta_duration', value: '0'},
  {option: 'show_default_meta_resolution', value: '0'},
  {option: 'show_default_meta_ext', value: '0'},
  {option: 'show_default_meta_codec', value: '0'},
  {option: 'show_default_meta_bitrate', value: '0'},
  {option: 'show_default_meta_fps', value: '0'},
  {option: 'show_default_meta_number_media', value: '0'},
  {option: 'show_default_meta_number_views', value: '0'},
  {option: 'default_meta_chip_variant', value: 'flat'},
  {option: 'pathParser.useML', value: 'true'},
  {option: 'pathParser.similarityThreshold', value: '0.75'},
  {option: 'pathParser.folderWeight', value: '1.5'},
  {option: 'pathParser.clusterThreshold', value: '0.88'},
  {option: 'pathParser.preferLongestMatch', value: 'true'},
  {option: 'pathParser.matchPrecision', value: '0.5'},
  {option: 'defaultTagCategoryId', value: ''},
  {option: 'enabledPluginsSchemaVersion', value: '0'},
  {option: 'faceMatch.performerMetaId', value: ''},
  {option: 'faceMatch.minConfidence', value: '0.55'},
  {option: 'faceMatch.candidateLimit', value: '10'},
  {option: 'faceMatch.mode', value: 'suggest'},
  {option: 'faceMatch.matchAfterDetect', value: '1'},
  {option: 'faceMatch.autoBlindTags', value: '0'},
  {option: 'faceMatch.embedModelId', value: 'insightface-r50-scrfd-kps-v1'},
  {option: 'faceDetect.minScore', value: '0.5'},
  {option: 'faceDetect.framesPerVideo', value: '6'},
  {option: 'faceDetect.genderFilter', value: 'both'},
  {option: 'meta_sort_mode', value: 'menu'},
  {option: 'meta_group_by', value: 'none'},
  {
    option: 'home_widgets_config',
    value: JSON.stringify({
      order: [
        'stats',
        'extendedStats',
        'quickActions',
        'continue',
        'favorites',
        'topViews',
        'markers',
        'health',
        'topTags',
      ],
      enabled: {
        stats: true,
        extendedStats: true,
        quickActions: true,
        continue: true,
        favorites: true,
        topViews: true,
        markers: true,
        health: true,
        topTags: true,
      },
      limits: {
        continue: 12,
        favorites: 12,
        topViews: 12,
        markers: 8,
        topTags: 10,
      },
    }),
  },
] as const

function seedMediaTypes(sqlite: Database.Database) {
  const row = sqlite.prepare(
    'SELECT COUNT(*) as count FROM mediaTypes WHERE custom = 0',
  ).get() as {count: number}

  if (Number(row.count) > 0) {
    return
  }

  const timestamp = nowIso()
  const insert = sqlite.prepare(`
    INSERT INTO mediaTypes (
      type, name, icon, extensions, custom, hidden, "order", createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const mediaType of DEFAULT_MEDIA_TYPES) {
    insert.run(
      mediaType.type,
      mediaType.name,
      mediaType.icon,
      mediaType.extensions,
      mediaType.custom,
      mediaType.hidden,
      mediaType.order,
      timestamp,
      timestamp,
    )
  }
}

function seedSettings(sqlite: Database.Database) {
  const timestamp = nowIso()
  const defaults = loadDefaultSettingsList() as Array<{option: string; value: unknown}>
  const seen = new Set<string>()
  const rows = [...defaults, ...MIGRATION_SETTINGS]

  const insert = sqlite.prepare(`
    INSERT INTO settings (option, value, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(option) DO NOTHING
  `)

  for (const row of rows) {
    if (seen.has(row.option)) {
      continue
    }
    seen.add(row.option)
    insert.run(row.option, String(row.value ?? ''), timestamp, timestamp)
  }
}

export function seedDefaults(sqlite: Database.Database) {
  seedMediaTypes(sqlite)
  seedSettings(sqlite)
}


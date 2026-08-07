import {ref, computed, onBeforeMount} from 'vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {
  getCurrentMediaType,
  matchesMediaTypeFilter,
} from '@/utils/mediaType'
import {
  getReadableBitrate,
  getReadableDuration,
  getReadableFileSize,
} from '@/services/formatUtils'
import type { PresetMetaParam, PresetMetaProps } from '@/types/itemsPage'

export function usePresetMeta(props: PresetMetaProps) {
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const itemsStore = useItemsStore()
  const {t} = useI18n()

  const numberOfMedia = ref(0)

  const SETTINGS = computed(() => settingsStore)
  const ENV = computed(() => itemsStore.environment)

  const preset_meta = computed((): PresetMetaParam[] => {
    if (SETTINGS.value.show_preset_metadata_in_card !== '1' && !props.isShowAll) {
      return []
    }

    const item = props.item
    if (!item) return []

    const currentMediaType = getCurrentMediaType(appStore.mediaTypes, ENV.value?.media_type_id)

    let params: PresetMetaParam[] = [
      {
        name: 'filesize',
        text: t('settings_labels.appearance.filesize'),
        icon: 'harddisk',
        types: ['media'],
        show: SETTINGS.value.show_default_meta_filesize === '1',
        value: getReadableFileSize(Number(item.filesize ?? 0)),
      },
      {
        name: 'duration',
        text: t('settings_labels.appearance.duration'),
        icon: 'clock-outline',
        types: ['media'],
        media_types: ['video'],
        show: SETTINGS.value.show_default_meta_duration === '1',
        value: getReadableDuration(Number(item.duration ?? 0)),
      },
      {
        name: 'resolution',
        text: t('settings_labels.appearance.resolution'),
        icon: 'monitor-screenshot',
        types: ['media'],
        media_types: ['video', 'image'],
        show: SETTINGS.value.show_default_meta_resolution === '1',
        value: `${item.width}x${item.height}`,
      },
      {
        name: 'ext',
        text: 'Extension',
        icon: 'file-video-outline',
        types: ['media'],
        show: SETTINGS.value.show_default_meta_ext === '1',
      },
      {
        name: 'codec',
        text: t('settings_labels.appearance.codec'),
        icon: 'filmstrip',
        types: ['media'],
        media_types: ['video'],
        show: SETTINGS.value.show_default_meta_codec === '1',
      },
      {
        name: 'bitrate',
        text: t('settings_labels.appearance.bitrate'),
        icon: 'filmstrip',
        types: ['media'],
        media_types: ['video'],
        show: SETTINGS.value.show_default_meta_bitrate === '1',
        value: getReadableBitrate(Number(item.bitrate ?? 0)),
      },
      {
        name: 'fps',
        text: t('settings_labels.appearance.framerate'),
        icon: 'filmstrip',
        types: ['media'],
        show: SETTINGS.value.show_default_meta_fps === '1',
        media_types: ['video'],
      },
      {
        name: 'numberOfMedia',
        text: t('settings_labels.appearance.number_of_media'),
        icon: 'image-multiple-outline',
        types: ['tag'],
        show: SETTINGS.value.show_default_meta_number_media === '1',
        value: numberOfMedia.value,
      },
      {
        name: 'views',
        text: t('settings_labels.appearance.number_of_views'),
        icon: 'eye-outline',
        show: SETTINGS.value.show_default_meta_number_views === '1',
        types: ['media', 'tag'],
      },
    ]

    if (!props.isShowAll) {
      params = params.filter((i) => i.show)
    }

    return params.filter((param) => {
      return param.types.some((type) => {
        if (type !== props.type) return false
        return matchesMediaTypeFilter(param, currentMediaType)
      })
    }).filter((i) => {
      if (i.name === 'resolution') {
        return Number(item.width) > 0 && Number(item.height) > 0
      }
      if (i.value != null && i.value !== '') return true
      const value = item[i.name]
      return value !== '' && value !== null && value !== undefined
    })
  })

  const countMediaInTag = (): void => {
    const tagId = Number(props.item?.id ?? 0)
    if (!tagId) return

    typedApi
      .getMediaCountWithTag(tagId)
      .then((res) => {
        numberOfMedia.value = res.data.count
      })
      .catch((e) => {
        console.log(e)
      })
  }

  onBeforeMount(() => {
    if (props.type == "tag") countMediaInTag()
  })

  return {
    preset_meta,
    numberOfMedia,
    countMediaInTag,
  }
}

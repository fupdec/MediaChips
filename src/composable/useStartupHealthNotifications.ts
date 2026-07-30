import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {useSettingsStore} from '@/stores/settings'

const notifiedByDb = new Map<string, Set<string>>()

function sessionKey(dbId: string | number | null | undefined): string {
  return dbId == null ? 'default' : String(dbId)
}

function wasNotified(dbKey: string, issueId: string): boolean {
  const set = notifiedByDb.get(dbKey)
  return Boolean(set?.has(issueId))
}

function markNotified(dbKey: string, issueId: string) {
  let set = notifiedByDb.get(dbKey)
  if (!set) {
    set = new Set()
    notifiedByDb.set(dbKey, set)
  }
  set.add(issueId)
}

/** Reset session anti-spam (tests). */
export function resetStartupHealthNotifications() {
  notifiedByDb.clear()
}

export function isStartupHealthNotificationsEnabled(
  value: unknown = useSettingsStore().startupHealthNotifications,
): boolean {
  return value !== '0' && value !== 0 && value !== false
}

export function useStartupHealthNotifications() {
  const router = useRouter()
  const {t} = useI18n()
  const settingsStore = useSettingsStore()

  const openSettingsSection = (section: string) => {
    void router.push({
      path: '/settings',
      query: {tab: 'database', section},
    })
  }

  const runStartupHealthCheck = async (dbId?: string | number | null) => {
    if (!isStartupHealthNotificationsEnabled(settingsStore.startupHealthNotifications)) {
      return
    }

    const dbKey = sessionKey(dbId)

    let data
    try {
      const response = await typedApi.getHomeHealthLite()
      data = response.data
    } catch (error) {
      console.warn('Startup health check failed:', error)
      return
    }

    const notify = (
      issueId: string,
      text: string,
      section: string,
      actionLabel: string,
    ) => {
      if (wasNotified(dbKey, issueId)) return
      markNotified(dbKey, issueId)
      setNotification({
        type: 'info',
        title: t('home.widgets.health_title'),
        text,
        timeout: 12000,
        actions: [
          {
            id: issueId,
            text: actionLabel,
            icon: 'cog-outline',
            action: () => openSettingsSection(section),
            hide: true,
          },
        ],
      })
    }

    if (Number(data.fingerprint?.pending) > 0) {
      notify(
        'fingerprint',
        t('home.widgets.health_fingerprint_pending', {count: data.fingerprint.pending}),
        'fingerprint_backfill',
        t('home.widgets.health_open_settings'),
      )
    }

    if (Number(data.oshash?.pending) > 0) {
      notify(
        'oshash',
        t('home.widgets.health_oshash_pending', {count: data.oshash.pending}),
        'oshash_backfill',
        t('home.widgets.health_open_settings'),
      )
    }

    if (Number(data.contentHash?.pending) > 0) {
      notify(
        'content-hash',
        t('home.widgets.health_content_hash_pending', {count: data.contentHash.pending}),
        'content_hash_backfill',
        t('home.widgets.health_open_settings'),
      )
    }

    if (Number(data.videoCodec?.pending) > 0) {
      notify(
        'video-codec',
        t('home.widgets.health_video_codec_pending', {count: data.videoCodec.pending}),
        'video_codec_backfill',
        t('home.widgets.health_open_video_codec_backfill'),
      )
    }

    if (data.tagImageAiUpscale && !data.tagImageAiUpscale.done && data.tagImageAiUpscale.suggested) {
      notify(
        'tag-ai-upscale',
        t('home.widgets.health_tag_image_ai_upscale', {
          size: data.tagImageAiUpscale.downloadSizeMb || 50,
        }),
        'tag_image_ai_upscale',
        t('home.widgets.health_open_tag_image_ai_upscale'),
      )
    }
  }

  return {runStartupHealthCheck}
}

import {MANUAL_MODELS, type ManualModelKind} from '@shared/manualModels'
import {setNotification} from './notificationService'
import router from '@/router'
export function modelDownloadError(kind: ManualModelKind, error: unknown, t: (key: string) => string) {
  setNotification({type: 'error', title: t('ai.models.downloading_title'),
    text: error instanceof Error ? error.message : String(error), timeout: 0,
    actions: [{text: t('ai.models.manual_settings'), icon: 'cog-outline', action: () => {
      void router.push({path: '/settings', query: {section: MANUAL_MODELS[kind].section}})
    }}],
  })
}

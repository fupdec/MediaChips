import {onMounted, ref, type Ref} from 'vue'
import {apiClient} from '@/services/apiClient'

export function useMediaServerProfiles(provider: 'plex' | 'jellyfin' | 'emby', baseUrl: Ref<string>) {
  const profiles = ref<Array<{id: string; baseUrl: string; selected: number}>>([])
  async function refresh() {
    try {
      const {data} = await apiClient.get<typeof profiles.value>(`/api/${provider}/profiles`)
      if (!Array.isArray(data)) return
      profiles.value = data
      if (!baseUrl.value) baseUrl.value = data.find(profile => profile.selected)?.baseUrl || ''
    } catch {
      // Existing servers can still accept manually entered credentials.
    }
  }
  function hasSavedCredential() {
    const url = baseUrl.value.trim().replace(/\/+$/, '')
    return profiles.value.some(profile => profile.baseUrl === url)
  }
  onMounted(refresh)
  return {profiles, refresh, hasSavedCredential}
}

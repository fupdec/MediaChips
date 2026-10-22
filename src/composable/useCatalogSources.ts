import {computed, ref, watch, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'

export function useCatalogSources(enabled: Ref<boolean>) {
  const {t} = useI18n()
  const connections = ref<Array<{value: string; name: string}>>([])
  watch(enabled, async active => {
    if (!active) return
    try { connections.value = (await typedApi.getCatalogSources()).data }
    catch (error) { console.error('Unable to load catalog sources', error) }
  }, {immediate: true})
  const sourceOptions = computed(() => [
    ...['local', 'nas', 'gdrive', 'onedrive', 'dropbox', 'web'].map(value => ({value, title: t(`sources.catalog.kinds.${value}`)})),
    ...connections.value.map(row => ({value: row.value, title: row.name})),
  ])
  const availabilityOptions = computed(() => ['available', 'unavailable', 'unknown'].map(value => ({
    value, title: t(`sources.catalog.states.${value}`),
  })))
  const label = (param: unknown, value: unknown) => {
    const options = param === 'source' ? sourceOptions.value : availabilityOptions.value
    return options.find(option => option.value === value)?.title || String(value)
  }
  return {sourceOptions, availabilityOptions, label}
}

<template>
  <div class="mx-4">
    <settings-category-divider
      icon="translate"
      :title="t('settings.groups.localization')"
    />

    <div class="language-switcher">
      <v-select
        :model-value="settingsStore.locale"
        @update:modelValue="value => changeLanguage(value)"
        :items="locales"
        rounded="xl"
        variant="outlined"
        density="comfortable"
        width="300"
        hide-details
      >
        <template #selection>
          <country-flag :country="selectedLocale.flag" size="big" class="lang-flag"/>
          <span class="pl-2">{{ t(selectedLocale.nameKey) }}</span>
          <span class="pl-2">({{ selectedLocale.nativeName }})</span>
        </template>
        <template #item="{ item }">
          <v-list-item @click="changeLanguage(item.raw.code)" color="primary">
            <template #prepend>
              <country-flag :country="item.raw.flag" size="big" class="lang-flag mr-2"/>
            </template>

            <v-list-item-title>
              <div class="d-flex align-center justify-space-between">
                <div>
                  <span class="text-body-1 text-high-emphasis">{{ t(item.raw.nameKey) }}</span>
                  <div class="text-caption text-medium-emphasis">
                    {{ item.raw.nativeName }}
                  </div>
                </div>
              </div>
            </v-list-item-title>
          </v-list-item>
        </template>
      </v-select>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {loadLocale} from '@/i18n/loadLocale'
import CountryFlag from '@/components/ui/CountryFlagLazy.vue'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'

const settingsStore = useSettingsStore()

const {locale, t} = useI18n()

const locales = [
  {
    code: 'en',
    nameKey: 'settings_labels.general.languages.en',
    nativeName: 'English',
    flag: 'us',
  },
  {
    code: 'de',
    nameKey: 'settings_labels.general.languages.de',
    nativeName: 'Deutsch',
    flag: 'de',
  },
  {
    code: 'es',
    nameKey: 'settings_labels.general.languages.es',
    nativeName: 'Español',
    flag: 'es',
  },
  {
    code: 'cn',
    nameKey: 'settings_labels.general.languages.cn',
    nativeName: '中文',
    flag: 'cn',
  },
  {
    code: 'ru',
    nameKey: 'settings_labels.general.languages.ru',
    nativeName: 'Русский',
    flag: 'ru',
  },
] as const

type LocaleEntry = (typeof locales)[number]

const selectedLocale = computed((): LocaleEntry =>
  locales.find(i => i.code === settingsStore.locale) ?? locales[0],
)

const changeLanguage = async (langCode: string) => {
  await loadLocale(langCode)
  locale.value = langCode

  setOption(langCode, "locale")

  document.documentElement.lang = langCode
}
</script>

<style scoped>
.language-switcher {
  display: inline-flex;
  align-items: center;
}
</style>

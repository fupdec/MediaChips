<script setup lang="ts">
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";

import {computed, ref, onMounted} from "vue";
import {useI18n} from "vue-i18n";
import {useSettingsStore} from "@/stores/settings";
import SettingsCategoryDivider
  from "@/components/ui/SettingsCategoryDivider.vue";
import {setOption} from '@/services/settingsService'
import {
  AUTO_LOCK_IDLE_MINUTE_OPTIONS,
  parseAutoLockIdleMinutes,
} from '@/composable/useIdleAutoLock'

const SETTINGS = useSettingsStore();
const {t} = useI18n();

// local fields
const password = ref("");
const hint = ref("");
const showPassword = ref(false);

const idleMinuteItems = computed(() =>
  AUTO_LOCK_IDLE_MINUTE_OPTIONS.map((minutes) => ({
    value: String(minutes),
    title: minutes === 0
      ? t('settings_labels.security.auto_lock_idle_off')
      : t('settings_labels.security.auto_lock_idle_minutes', {count: minutes}),
  })),
)

const idleMinutesModel = computed({
  get: () => String(parseAutoLockIdleMinutes(SETTINGS.autoLockIdleMinutes)),
  set: (value: string) => {
    void setOption(String(parseAutoLockIdleMinutes(value)), 'autoLockIdleMinutes')
  },
})

onMounted(() => {
  password.value = SETTINGS.phrase;
  hint.value = SETTINGS.passwordHint;
});
</script>

<template>
  <div class="mx-4">
    <settings-category-divider icon="security"
      :title="t('settings_labels.security.title')"></settings-category-divider>

    <!-- Switch: Password protection -->
    <settings-switch
      option="passwordProtection"
      :title="t('settings_labels.security.password_protection')"
      :hint="t('settings_labels.security.password_protection_hint')"
    ></settings-switch>

    <!-- Password fields -->
    <v-row v-if="SETTINGS.passwordProtection === '1'"
      class="mb-4">
      <v-col cols="12"
        sm="6">
        <v-text-field
          v-model="password"
          @blur="setOption(password, 'phrase')"
          :type="showPassword ? 'text' : 'password'"
          :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
          @click:append-inner="showPassword = !showPassword"
          :label="t('settings_labels.security.password')"
          rounded
          variant="outlined"
          hide-details
        />
      </v-col>

      <v-col cols="12"
        sm="6">
        <v-text-field
          v-model="hint"
          @blur="setOption(hint, 'passwordHint')"
          :label="t('common.hint')"
          rounded
          variant="outlined"
          hide-details
        />
      </v-col>

      <v-col cols="12" sm="6">
        <v-select
          v-model="idleMinutesModel"
          :items="idleMinuteItems"
          item-title="title"
          item-value="value"
          :label="t('settings_labels.security.auto_lock_idle')"
          :hint="t('settings_labels.security.auto_lock_idle_hint')"
          persistent-hint
          rounded
          variant="outlined"
        />
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'

import {computed, ref, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setOption} from '@/services/settingsService'
import {typedApi} from '@/services/typedApi'
import {getAuthToken, setAuthToken} from '@/services/authSession'
import {
  AUTO_LOCK_IDLE_MINUTE_OPTIONS,
  parseAutoLockIdleMinutes,
} from '@/composable/useIdleAutoLock'

const SETTINGS = useSettingsStore()
const {t} = useI18n()

const password = ref('')
const hint = ref('')
const showPassword = ref(false)
const passwordSaved = ref(false)

// The server stores only a hash, so the field is for setting a new password,
// never for showing the current one. Empty blur = keep the current password.
async function ensureSession() {
  if (getAuthToken()) return
  // Right after the protection switch is turned on there is no password yet and
  // no session (none is issued while protection is off), so the PUT below would
  // 401 and lock the app. An empty-password login succeeds in exactly that state.
  try {
    const res = await typedApi.login('')
    setAuthToken(res.data.token)
  } catch {
    // A password is already set — the user is logged in through the normal flow.
  }
}

async function saveNewPassword() {
  const value = password.value
  if (!value) return
  await ensureSession()
  await setOption(value, 'phrase')
  SETTINGS.phrase = ''
  password.value = ''
  passwordSaved.value = true
}

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
  hint.value = SETTINGS.passwordHint
})
</script>

<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      icon="security"
      :title="t('settings_labels.security.title')"
    />

    <SettingsGroupPanel>
      <settings-switch
        option="passwordProtection"
        :title="t('settings_labels.security.password_protection')"
        :hint="t('settings_labels.security.password_protection_hint')"
      />

      <v-row
        v-if="SETTINGS.passwordProtection === '1'"
        class="mt-2 mb-1"
      >
        <v-col
          cols="12"
          sm="6"
        >
          <v-text-field
            v-model="password"
            @blur="saveNewPassword"
            @update:model-value="passwordSaved = false"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
            @click:append-inner="showPassword = !showPassword"
            :label="t('settings_labels.security.new_password')"
            :hint="passwordSaved ? t('settings_labels.security.password_updated') : t('settings_labels.security.new_password_hint')"
            persistent-hint
            autocomplete="new-password"
            rounded
            variant="outlined"
          />
        </v-col>

        <v-col
          cols="12"
          sm="6"
        >
          <v-text-field
            v-model="hint"
            @blur="setOption(hint, 'passwordHint')"
            :label="t('common.hint')"
            rounded
            variant="outlined"
            hide-details
          />
        </v-col>

        <v-col
          cols="12"
          sm="6"
        >
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
    </SettingsGroupPanel>
  </div>
</template>

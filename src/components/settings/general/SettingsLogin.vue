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
type CheckState = 'idle' | 'busy' | 'ok' | 'wrong' | 'throttled'
const checkState = ref<CheckState>('idle')
// The typed value stays in the field after saving, so it doesn't look like it was lost.
let savedPassword = ''

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
  if (!value || value === savedPassword) return
  await ensureSession()
  await setOption(value, 'phrase')
  SETTINGS.phrase = ''
  savedPassword = value
  passwordSaved.value = true
}

// Verifies the typed password against the stored hash without touching the
// current session: the token from this login is deliberately not kept.
async function checkPassword() {
  if (!password.value || checkState.value === 'busy') return
  checkState.value = 'busy'
  try {
    await typedApi.verifyPassword(password.value)
    checkState.value = 'ok'
  } catch (err: unknown) {
    const status = (err as {response?: {status?: number}})?.response?.status
    checkState.value = status === 429 ? 'throttled' : 'wrong'
  }
}

const passwordHint = computed(() => {
  if (checkState.value === 'ok') return t('settings_labels.security.password_correct')
  if (passwordSaved.value) return t('settings_labels.security.password_updated')
  return t('settings_labels.security.new_password_hint')
})

const passwordErrors = computed(() => {
  if (checkState.value === 'wrong') return [t('login.wrong_password')]
  if (checkState.value === 'throttled') return [t('login.too_many_attempts')]
  return []
})

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
            @update:model-value="(value: string) => { passwordSaved = !!value && value === savedPassword; checkState = 'idle' }"
            :type="showPassword ? 'text' : 'password'"
            :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
            @click:append-inner="showPassword = !showPassword"
            :label="t('settings_labels.security.new_password')"
            :hint="passwordHint"
            :error-messages="passwordErrors"
            :prepend-inner-icon="passwordSaved ? 'mdi-check-circle' : undefined"
            placeholder="••••••••"
            persistent-placeholder
            persistent-hint
            autocomplete="new-password"
            @keyup.enter="checkPassword"
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

        <v-col
          cols="12"
          sm="6"
        >
          <v-btn
            @click="checkPassword"
            :disabled="!password"
            :loading="checkState === 'busy'"
            variant="tonal"
            height="56"
            rounded="lg"
            prepend-icon="mdi-shield-check-outline"
          >
            {{ t('settings_labels.security.check_password') }}
          </v-btn>
        </v-col>
      </v-row>
    </SettingsGroupPanel>
  </div>
</template>

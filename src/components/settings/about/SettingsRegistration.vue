<template>
  <div class="mx-4">
    <settings-category-divider
      :title="t('registration.activation_key')"
      icon="key-variant"
    />

    <template v-if="isStoreChannel">
      <v-table class="mb-4">
        <tbody>
          <tr>
            <td>{{ t('registration.status') }}</td>
            <td>
              <v-chip color="success" variant="tonal" label>
                <span>{{ t('registration.store_licensed') }}</span>
              </v-chip>
            </td>
          </tr>
          <tr>
            <td>{{ t('registration.license_source') }}</td>
            <td><b>{{ t('registration.microsoft_store') }}</b></td>
          </tr>
        </tbody>
      </v-table>
      <div class="text-caption text-medium-emphasis mb-4">
        {{ t('registration.store_licensed_hint') }}
      </div>
    </template>

    <template v-else>
    <v-table class="mb-4">
      <tbody>
      <tr>
        <td>{{ t('registration.status') }}</td>
        <td>
          <v-chip :color="reg ? 'success' : 'error'" variant="tonal" label>
            <span>{{ reg ? t('registration.application_registered') : t('registration.application_not_registered') }}</span>
          </v-chip>
        </td>
      </tr>
      <tr v-if="savedLicenseCode">
        <td>{{ t('registration.activation_key') }}</td>
        <td><b>{{ savedLicenseCode }}</b></td>
      </tr>
      <tr v-if="savedLicenseCode">
        <td>{{ t('registration.used_devices') }}</td>
        <td><b>{{ activated_devices }} / 3</b></td>
      </tr>
      <tr v-if="savedLicenseCode">
        <td>{{ t('registration.expiration_date') }}</td>
        <td><b>{{ displayLicenseInfo?.license_expiry || "??" }}</b></td>
      </tr>
      </tbody>
    </v-table>

    <div class="mb-4">
      <v-btn @click="openDialog" color="primary" rounded variant="flat">
        <v-icon start>mdi-key</v-icon>
        {{ t('registration.enter_activation_key') }}
      </v-btn>
    </div>

    <div v-if="reg" class="mb-4">
      <v-btn
        @click="dialogDeactivateConfirm = true"
        color="error"
        rounded
        variant="flat"
        dark
      >
        <v-icon start>mdi-cancel</v-icon>
        <span>{{ t('registration.deactivate_on_device') }}</span>
      </v-btn>
    </div>

    <div v-if="savedLicenseCode" class="mb-4">
      <v-btn
        @click="dialogDeactivateOthersConfirm = true"
        color="warning"
        rounded
        variant="flat"
        :loading="isLicenseRefreshRun"
        :disabled="isLicenseRefreshRun"
      >
        <v-icon start>mdi-devices</v-icon>
        <span>{{ t('registration.deactivate_other_devices') }}</span>
      </v-btn>
    </div>

    <div v-if="licenseInfo?.license_type !== 'Lifetime'" class="mb-4">
      <v-btn
        @click="openLink('https://mediachips.app/')"
        color="primary"
        rounded
        variant="flat"
      >
        <v-icon start>mdi-cart</v-icon>
        {{ t('registration.buy_lifetime_key') }}
      </v-btn>
    </div>
    </template>

    <v-dialog
      v-model="dialog"
      scrollable
      persistent
      width="800"
    >
      <v-stepper
        v-model="step"
        rounded="lg"
      >
        <v-stepper-header>
          <!-- STEPS HEADER -->
          <v-stepper-item
            :value="1"
            :complete="step > 1"
            :error="!!checkingStatus"
            :title="t('registration.entering_key')"
            color="primary"
          ></v-stepper-item>

          <v-divider></v-divider>

          <v-stepper-item
            :value="2"
            :complete="step > 1 && (activationsCount < 3 || !isKeyExpired)"
            :error="activationsCount > 2 || isKeyExpired"
            :title="t('registration.key_status')"
            color="primary"
          ></v-stepper-item>

          <v-divider></v-divider>

          <v-stepper-item
            :value="3"
            :complete="step == 3"
            :title="t('registration.registration')"
            color="primary"
          ></v-stepper-item>

        </v-stepper-header>

        <!--  STEPS ITEMS  -->
        <v-stepper-window class="ma-0">
          <v-stepper-window-item :value="1" class="pa-0">

            <!-- 1 STEP : ENTER -->
            <v-card :loading="isQueryRun">
              <template v-slot:loader="{ isActive }">
                <v-progress-linear
                  :active="isActive"
                  color="primary"
                  height="4"
                  indeterminate
                ></v-progress-linear>
              </template>

              <v-card-text class="text-center pt-6">
                <v-form
                  v-model="valid"
                  @submit.prevent
                  ref="form"
                  class="d-flex"
                >
                  <v-text-field
                    v-model="licenseKey"
                    @keyup.enter="checkLicenseKey"
                    :rules="[(value) => !!value || t('registration.key_required')]"
                    hint="XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                    color="primary"
                    :label="t('registration.activation_key')"
                    variant="filled"
                    autofocus
                  />
                </v-form>

                <v-alert
                  type="error"
                  :model-value="checkingStatus.length != 0"
                  density="compact"
                  variant="tonal"
                  rounded="xl"
                  closable
                >
                  {{ checkingStatus }}
                </v-alert>
              </v-card-text>

              <v-card-actions>
                <v-btn @click="dialog = false" class="ma-2 pr-4" variant="text" rounded>
                  <v-icon start>mdi-close</v-icon>
                  {{ t('common.cancel') }}
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn
                  @click="checkLicenseKey"
                  :disabled="isQueryRun"
                  color="primary"
                  class="ma-2 px-4"
                  rounded
                  variant="flat"
                >
                  <v-icon start>mdi-key-variant</v-icon>
                  {{ t('registration.check_key_status') }}
                  <v-icon size="large" end>mdi-chevron-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- 2 STEP : CONFIRM -->

          <v-stepper-window-item :value="2" class="pa-0">
            <v-card :loading="isQueryRun" :disabled="isQueryRun">
              <template v-slot:loader="{ isActive }">
                <v-progress-linear
                  :active="isActive"
                  color="primary"
                  height="4"
                  indeterminate
                ></v-progress-linear>
              </template>

              <v-card-text class="text-body-1 pt-8">
                <v-table>
                  <tbody>
                  <tr>
                    <td>{{ t('registration.key') }}</td>
                    <td><b>{{ licenseKey }}</b></td>
                    <td>
                      <v-icon color="success">mdi-check</v-icon>
                    </td>
                  </tr>
                  <tr>
                    <td>{{ t('registration.used_devices') }}</td>
                    <td><b>{{ activationsCount }} / 3</b></td>
                    <td>
                      <v-icon v-if="activationsCount < 3" color="success">mdi-check</v-icon>
                      <v-icon v-else color="error">mdi-close</v-icon>
                    </td>
                  </tr>
                  <tr>
                    <td>{{ t('registration.expiration_date') }}</td>
                    <td><b>{{ licenseExpiryDate }}</b></td>
                    <td>
                      <v-icon v-if="isKeyExpired" color="error">mdi-close</v-icon>
                      <v-icon v-else color="success">mdi-check</v-icon>
                    </td>
                  </tr>
                  </tbody>
                </v-table>

                <v-alert
                  v-if="activationsCount > 2 || isKeyExpired"
                  class="mt-4"
                  color="error"
                  rounded="xl"
                  variant="tonal"
                >
                  <div v-if="activationsCount > 2">
                    {{ t('registration.activations_exceeded') }}
                  </div>
                  <div v-if="isKeyExpired">{{ t('registration.key_expired') }}</div>
                  <div v-if="activationsCount > 2 || isKeyExpired">
                    {{ t('registration.enter_another_key') }}
                  </div>
                </v-alert>

                <div v-if="activationsCount > 2" class="mt-4">
                  <v-btn
                    @click="dialogDeactivateOthersConfirm = true"
                    color="warning"
                    rounded
                    variant="flat"
                    :disabled="isQueryRun"
                  >
                    <v-icon start>mdi-devices</v-icon>
                    {{ t('registration.deactivate_other_devices') }}
                  </v-btn>
                </div>
              </v-card-text>
              <v-card-actions>
                <v-btn @click="closeDialog" class="ma-2 pr-4" text rounded>
                  <v-icon start>mdi-close</v-icon>
                  {{ t('common.cancel') }}
                </v-btn>
                <v-spacer></v-spacer>
                <v-btn @click="step = 1" class="ma-2 pr-4" text rounded>
                  <v-icon size="large" start>mdi-chevron-left</v-icon>
                  <span>{{ t('registration.back_to_entering_key') }}</span>
                </v-btn>
                <v-btn
                  @click="register"
                  color="primary"
                  class="ma-2 px-4"
                  :disabled="
                    activationsCount > 2 || isQueryRun || isKeyExpired
                  "
                  rounded
                  variant="flat"
                >
                  <v-icon start>mdi-key-variant</v-icon>
                  {{ t('registration.register_app') }}
                  <v-icon size="large" end>mdi-chevron-right</v-icon>
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>

          <!-- 3 STEP : FINAL -->

          <v-stepper-window-item :value="3" class="pa-0">
            <v-card :loading="isQueryRun" class="pt-4">
              <v-card-text class="text-center text-body-1">
                <div>{{ registrationStatus }}</div>
              </v-card-text>
              <v-card-actions class="pa-4">
                <v-spacer></v-spacer>
                <v-btn
                  @click="closeDialog"
                  color="primary"
                  variant="flat"
                  class="px-4"
                  rounded
                >
                  {{ t('common.ok') }}
                </v-btn>
                <v-spacer></v-spacer>
              </v-card-actions>
            </v-card>
          </v-stepper-window-item>
        </v-stepper-window>
      </v-stepper>
    </v-dialog>

    <DialogConfirm
      v-if="dialogDeactivateConfirm"
      @close="dialogDeactivateConfirm = false"
      @confirm="deactivateKey"
      :dialog="dialogDeactivateConfirm"
      :text="t('registration.deactivate_confirm')"
    />

    <DialogConfirm
      v-if="dialogDeactivateOthersConfirm"
      @close="dialogDeactivateOthersConfirm = false"
      @confirm="deactivateOtherDevices"
      :dialog="dialogDeactivateOthersConfirm"
      :text="t('registration.deactivate_other_devices_confirm')"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRegistrationStore} from '@/stores/registration'
import {useNotificationsStore} from '@/stores/notifications'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {isMsStoreBuild} from '@/utils/sfwBuild'
import type {VFormInstance} from '@/types/vue'
import type {LicenseInfo} from '@/types/stores'

interface AxiosLikeError {
  response?: { data?: { message?: string } }
  message?: string
}

interface LicenseActionResponse {
  success?: boolean
  message?: string
}

// Инициализация хранилищ
const registrationStore = useRegistrationStore()
const notificationsStore = useNotificationsStore()
const {t} = useI18n()
const isStoreChannel = isMsStoreBuild()

function getErrorMessage(error: unknown, fallback: string): string {
  const err = error as AxiosLikeError
  return err.response?.data?.message || err.message || fallback
}

// Локальные реактивные переменные
const dialog = ref(false)
const dialogDeactivateConfirm = ref(false)
const dialogDeactivateOthersConfirm = ref(false)
const step = ref(1)
const licenseKey = ref('')
const valid = ref(false)
const isQueryRun = ref(false)
const numberOfActivations = ref<number | null>(null)
const licenseExpiryDate = ref('')
const isKeyExpired = ref(false)
const checkingStatus = ref('')
const registrationStatus = ref('')
const activated_devices = ref(0)
const checkedLicenseInfo = ref<LicenseInfo | null>(null)
const remoteLicenseInfo = ref<LicenseInfo | null>(null)
const isLicenseRefreshRun = ref(false)

const cleanObj: LicenseInfo = {
  license_code: '',
  license_created: '',
  license_expiry: '',
  license_type: '',
  client_email: '',
  client_name: '',
  fingerprint_1: '',
  fingerprint_2: '',
  fingerprint_3: ''
}

// Вычисляемые свойства
const regInfo = computed(() => registrationStore.regInfo)
const reg = computed(() => registrationStore.reg)
const licenseInfo = computed((): LicenseInfo | null => {
  const info = regInfo.value
  return info && typeof info === 'object' ? info : null
})
const savedLicenseCode = computed(() => licenseInfo.value?.license_code || '')
const displayLicenseInfo = computed((): LicenseInfo | null => {
  return remoteLicenseInfo.value || licenseInfo.value || null
})
const activationsCount = computed(() => numberOfActivations.value ?? 0)

const refreshLicenseFromServer = async () => {
  const licenseCode = savedLicenseCode.value
  if (!licenseCode) {
    remoteLicenseInfo.value = null
    activated_devices.value = 0
    return
  }

  isLicenseRefreshRun.value = true

  try {
    await registrationStore.ensureMachineId()
    const data = await registrationStore.checkLicense(licenseCode)
    if (data) {
      remoteLicenseInfo.value = data
      activated_devices.value = calculateActivations(data)
    } else if (licenseInfo.value) {
      activated_devices.value = calculateActivations(licenseInfo.value)
    }
  } catch (error) {
    console.warn('Failed to refresh license from server:', error)
    if (licenseInfo.value) {
      activated_devices.value = calculateActivations(licenseInfo.value)
    }
  } finally {
    isLicenseRefreshRun.value = false
  }
}

// Ссылка на форму
const form = ref<VFormInstance>(null)

// Методы
const openDialog = () => {
  step.value = 1
  licenseKey.value = licenseInfo.value?.license_code || ''
  dialog.value = true
  checkingStatus.value = ''
}

const closeDialog = () => {
  dialog.value = false
  checkingStatus.value = ''
  setTimeout(() => {
    step.value = 1
  }, 1000)
}

const openLink = (link: string) => {
  window.open(link, '_blank')
}

const calculateActivations = (data: LicenseInfo) => {
  const fingerprints = [
    data.fingerprint_1,
    data.fingerprint_2,
    data.fingerprint_3
  ]

  let numberOfActivationsCount = 0
  for (let i = 0; i < fingerprints.length; i++) {
    if (fingerprints[i] && fingerprints[i]!.length > 0) {
      ++numberOfActivationsCount
    }
  }

  return numberOfActivationsCount
}

const checkLicenseKey = async () => {
  if (!valid.value) return

  isQueryRun.value = true

  try {
    const data = await registrationStore.checkLicense(licenseKey.value)

    if (data) {
      checkedLicenseInfo.value = data
      numberOfActivations.value = calculateActivations(data)

      const today = new Date().toISOString().substring(0, 10)
      const expiry = data.license_expiry || ''
      isKeyExpired.value = today > expiry && expiry !== '0000-00-00'

      licenseExpiryDate.value = expiry
      step.value = 2
      checkingStatus.value = ''
    } else {
      checkingStatus.value = t('registration.key_not_found', {key: licenseKey.value})
    }
  } catch (error) {
    checkingStatus.value = getErrorMessage(error, t('registration.internet_error_checking_key'))
    notificationsStore.setNotification({
      type: 'error',
      text: t('registration.internet_error_checking_key')
    })
  } finally {
    isQueryRun.value = false
  }
}

const register = async () => {
  isQueryRun.value = true

  try {
    const data = await registrationStore.activateLicense(licenseKey.value)

    if (data && data.activated) {
      registrationStatus.value = data.message || ''

      try {
        if (data.license) {
          await registrationStore.updateRegInfo(data.license)
          registrationStatus.value = t('registration.registration_successful')
          await refreshLicenseFromServer()
        } else {
          registrationStatus.value = t('registration.registration_failed')
        }
      } catch (encryptError) {
        console.error('Registration save error:', encryptError)
        registrationStatus.value = t('registration.registration_failed')
      }

      step.value = 3
    } else {
      registrationStatus.value = data?.message || t('registration.registration_failed')
    }
  } catch (error) {
    const errorText = getErrorMessage(error, t('registration.registration_failed'))
    registrationStatus.value = errorText

    notificationsStore.setNotification({
      type: 'error',
      text: errorText
    })
  } finally {
    isQueryRun.value = false
  }
}

const deactivateKey = async () => {
  dialogDeactivateConfirm.value = false

  const licenseCode = licenseInfo.value?.license_code
  if (!licenseCode) {
    notificationsStore.setNotification({
      type: 'error',
      text: t('registration.no_activation_key_found')
    })
    return
  }

  try {
    const data = await registrationStore.deactivateLicense(licenseCode) as LicenseActionResponse

    if (data.success) {
      notificationsStore.setNotification({
        type: 'info',
        text: data.message || ''
      })
      licenseKey.value = ''

      await registrationStore.updateRegInfo(cleanObj)
      activated_devices.value = 0
      remoteLicenseInfo.value = null
    } else {
      notificationsStore.setNotification({
        type: 'error',
        text: data.message || t('registration.deactivation_failed')
      })
    }
  } catch (error) {
    notificationsStore.setNotification({
      type: 'error',
      text: getErrorMessage(error, t('registration.deactivation_failed'))
    })
  }
}

const deactivateOtherDevices = async () => {
  dialogDeactivateOthersConfirm.value = false

  const licenseCode = licenseInfo.value?.license_code || licenseKey.value
  if (!licenseCode) {
    notificationsStore.setNotification({
      type: 'error',
      text: t('registration.no_activation_key_found')
    })
    return
  }

  isQueryRun.value = true

  try {
    const data = await registrationStore.deactivateOtherDevices(licenseCode)

    if (data.deactivatedCount === 0) {
      notificationsStore.setNotification({
        type: 'info',
        text: t('registration.deactivate_other_devices_none')
      })
      return
    }

    if (data.success) {
      notificationsStore.setNotification({
        type: 'success',
        text: t('registration.deactivate_other_devices_success', {count: data.deactivatedCount})
      })

      const freshData = data.license || await registrationStore.checkLicense(licenseCode)
      if (freshData) {
        checkedLicenseInfo.value = freshData
        remoteLicenseInfo.value = freshData
        numberOfActivations.value = calculateActivations(freshData)
        activated_devices.value = numberOfActivations.value
      }
    } else {
      notificationsStore.setNotification({
        type: 'error',
        text: data.message || t('registration.deactivation_failed')
      })
    }
  } catch (error) {
    notificationsStore.setNotification({
      type: 'error',
      text: getErrorMessage(error, t('registration.deactivation_failed'))
    })
  } finally {
    isQueryRun.value = false
  }
}

// Инициализация при монтировании
onMounted(() => {
  if (savedLicenseCode.value) {
    refreshLicenseFromServer()
  }
})

watch(savedLicenseCode, (licenseCode) => {
  if (licenseCode) {
    refreshLicenseFromServer()
  } else {
    remoteLicenseInfo.value = null
    activated_devices.value = 0
  }
})
</script>

<style scoped>
.user-select {
  user-select: text;
  -webkit-user-select: text;
}
</style>
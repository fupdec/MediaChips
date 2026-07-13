import { defineStore } from 'pinia'
import { apiClient } from '@/services/apiClient'
import useSettingsStore from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useNotificationsStore } from '@/stores/notifications'
import { resolveApiBaseUrl } from '@/utils/apiBaseUrl'
import { setOption } from '@/services/settingsService'
import { refreshServerConfig, updateConfig } from '@/services/configService'
import { ZodError } from 'zod'
import {
  parseLicenseActivateResponse,
  parseLicenseDeactivateOthersResponse,
  parseLicenseInfo,
} from '@/schemas/license'
import type { LicenseInfo } from '@/types/stores'

const LICENSE_API_BASE_URL = import.meta.env.VITE_LICENSE_API_URL || 'https://mediachips.app/wp-json/mediachips/v1/license'

const MACHINE_ID_PATHS = ['/api/getMachineId', '/api/Task/getMachineId']

interface AxiosLikeError {
  response?: { status?: number; data?: { message?: string } }
  config?: { url?: string }
  message?: string
}

interface RegistrationState {
  machineId: string | null
  licenseApiBaseUrl: string
  _regInfoCache: LicenseInfo | '' | null
}

type AutoRegisterResult = {
  success: boolean
  skipped?: boolean
  error?: string
}

function isValidMachineId(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const id = value.trim()
  if (id.length < 16 || id.length > 128) return false
  if (/[<]/.test(id)) return false

  return /^[a-f0-9-]+$/i.test(id)
}

function collectLicenseFingerprints(data: LicenseInfo) {
  return [data.fingerprint_1, data.fingerprint_2, data.fingerprint_3]
    .filter((fingerprint): fingerprint is string => !!fingerprint && fingerprint.length > 0)
}

function calculateActivations(data: LicenseInfo) {
  return collectLicenseFingerprints(data).length
}

type DeactivateOtherDevicesResult = {
  success: boolean
  deactivatedCount: number
  message?: string
  license?: LicenseInfo
}

function getErrorMessage(error: unknown, fallback: string) {
  const err = error as AxiosLikeError
  if (err.response?.status === 404) {
    const url = err.config?.url || ''
    if (url.includes('mediachips.app')) {
      return 'License service is unavailable (404). Check your internet connection.'
    }
    return 'Device ID service is unavailable (404). Restart the application and try again.'
  }

  if (error instanceof ZodError) {
    return fallback
  }

  return err.response?.data?.message || err.message || fallback
}

function collectMachineIdApiBases() {
  const appStore = useAppStore()
  const bases = new Set<string>()

  const resolved = resolveApiBaseUrl(
    appStore.config || {},
    appStore.localhost ? { url: appStore.localhost } : null,
  )
  if (resolved) bases.add(resolved.replace(/\/$/, ''))

  if (appStore.localhost) {
    bases.add(appStore.localhost.replace(/\/$/, ''))
  }

  return [...bases]
}

async function fetchMachineIdViaElectron() {
  if (typeof window === 'undefined' || !window.electronAPI?.invoke) {
    return null
  }

  try {
    const id = await window.electronAPI.invoke('get-machine-id')
    return isValidMachineId(id) ? id.trim() : null
  } catch (error) {
    const err = error as Error
    console.warn('Failed to fetch machine id via Electron IPC:', err.message)
    return null
  }
}

async function fetchMachineIdViaHttp() {
  const bases = collectMachineIdApiBases()
  if (bases.length === 0) return null

  for (const base of bases) {
    for (const machineIdPath of MACHINE_ID_PATHS) {
      try {
        const response = await apiClient.get(machineIdPath, { baseURL: base })
        if (isValidMachineId(response.data)) {
          return response.data.trim()
        }
      } catch (error) {
        const err = error as AxiosLikeError
        if (err.response?.status !== 404) {
          console.warn(`Failed to fetch machine id from ${base}${machineIdPath}:`, err.message)
        }
      }
    }
  }

  return null
}

function isValidRegistrationString(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 10
}

function readRegistrationFromConfig(): string | null {
  const appStore = useAppStore()
  const registration = appStore.config?.registration
  return isValidRegistrationString(registration) ? registration : null
}

function readRegistrationFromDbSettings(): string | null {
  try {
    const registration = useSettingsStore().registration
    return isValidRegistrationString(registration) ? registration : null
  } catch {
    return null
  }
}

function parseRegistrationString(registration: string): LicenseInfo | '' {
  try {
    return JSON.parse(registration) as LicenseInfo
  } catch (parseError) {
    console.error('Registration parse error:', parseError)
    return ''
  }
}

export const useRegistrationStore = defineStore('useRegistrationStore', {
  state: (): RegistrationState => ({
    machineId: null,
    licenseApiBaseUrl: LICENSE_API_BASE_URL,
    _regInfoCache: null,
  }),
  actions: {
    invalidateRegInfoCache() {
      this._regInfoCache = null
    },

    async updateRegInfo(value: string | LicenseInfo) {
      try {
        const registration = typeof value === 'string' ? value : JSON.stringify(value)

        this._regInfoCache = JSON.parse(registration) as LicenseInfo

        await updateConfig({ registration })

        const appStore = useAppStore()
        appStore.config = {
          ...appStore.config,
          registration,
        }

        const settingsStore = useSettingsStore()
        if (settingsStore.registration) {
          settingsStore.registration = ''
          await setOption('', 'registration')
        }
      } catch (error) {
        console.error('Failed to update registration info:', error)
        throw error
      }
    },

    async clearRegistration() {
      this._regInfoCache = null

      await updateConfig({ registration: '' })

      const appStore = useAppStore()
      appStore.config = {
        ...appStore.config,
        registration: '',
      }

      const settingsStore = useSettingsStore()
      settingsStore.registration = ''
      await setOption('', 'registration')
    },

    async migrateRegistrationFromDbIfNeeded() {
      const configRegistration = readRegistrationFromConfig()
      const dbRegistration = readRegistrationFromDbSettings()

      if (configRegistration) {
        if (dbRegistration && dbRegistration !== configRegistration) {
          const settingsStore = useSettingsStore()
          settingsStore.registration = ''
          await setOption('', 'registration')
        }
        return
      }

      if (!dbRegistration) {
        return
      }

      await updateConfig({ registration: dbRegistration })

      const appStore = useAppStore()
      appStore.config = {
        ...appStore.config,
        registration: dbRegistration,
      }
      this._regInfoCache = parseRegistrationString(dbRegistration) || null

      const settingsStore = useSettingsStore()
      settingsStore.registration = ''
      await setOption('', 'registration')
    },

    async reloadRegistrationFromConfig() {
      this.invalidateRegInfoCache()
      await refreshServerConfig()
      await this.migrateRegistrationFromDbIfNeeded()
    },

    async ensureMachineId() {
      if (this.machineId) return this.machineId

      const machineId = await fetchMachineIdViaElectron() || await fetchMachineIdViaHttp()
      if (!machineId) {
        throw new Error('Device id is not available')
      }

      this.machineId = machineId
      return this.machineId
    },

    async checkLicense(licenseCode: string) {
      const response = await apiClient.post(`${this.licenseApiBaseUrl}/check`, {
        license_code: licenseCode,
      })

      return parseLicenseInfo(response.data)
    },

    async activateLicense(licenseCode: string, fingerprint?: string) {
      const resolvedFingerprint = fingerprint || await this.ensureMachineId()

      const response = await apiClient.post(`${this.licenseApiBaseUrl}/activate`, {
        license_code: licenseCode,
        fingerprint: resolvedFingerprint,
      })

      return parseLicenseActivateResponse(response.data)
    },

    async deactivateLicense(licenseCode: string, fingerprint?: string) {
      const resolvedFingerprint = fingerprint || await this.ensureMachineId()

      const response = await apiClient.post(`${this.licenseApiBaseUrl}/deactivate`, {
        license_code: licenseCode,
        fingerprint: resolvedFingerprint,
      })

      return response.data
    },

    async deactivateOtherDevices(licenseCode: string): Promise<DeactivateOtherDevicesResult> {
      const fingerprint = await this.ensureMachineId()

      const response = await apiClient.post(`${this.licenseApiBaseUrl}/deactivate-others`, {
        license_code: licenseCode,
        fingerprint,
      })

      const data = parseLicenseDeactivateOthersResponse(response.data)
      if (!data) {
        return { success: false, deactivatedCount: 0, message: 'Invalid response from license service' }
      }

      const info = this.regInfo
      if (data.license && info && typeof info === 'object' && info.license_code === licenseCode) {
        await this.updateRegInfo(data.license)
      }

      return {
        success: !!data.success,
        deactivatedCount: data.deactivated_count ?? 0,
        message: data.message,
        license: data.license as LicenseInfo | undefined,
      }
    },

    async tryAutoRegisterOnStartup(): Promise<AutoRegisterResult> {
      const info = this.regInfo
      if (!info || typeof info !== 'object' || !info.license_code) {
        return { success: true, skipped: true }
      }

      const licenseCode = info.license_code

      let machineId: string
      try {
        machineId = await this.ensureMachineId()
      } catch {
        console.warn('Auto registration skipped: device id is not available')
        return { success: false, skipped: true, error: 'Device id is not available' }
      }

      try {
        const today = new Date().toISOString().substring(0, 10)
        const storedFingerprints = [info.fingerprint_1, info.fingerprint_2, info.fingerprint_3]
        const isAlreadyActivated = storedFingerprints.includes(machineId)
        const isExpired = today > (info.license_expiry || '') && info.license_expiry !== '0000-00-00'

        if (isAlreadyActivated && !isExpired) {
          return { success: true, skipped: true }
        }

        const checkData = await this.checkLicense(licenseCode)
        if (!checkData) {
          const errorText = `Key "${licenseCode}" not found`
          this._notifyAutoRegisterError(errorText)
          return { success: false, error: errorText }
        }

        const isKeyExpired = today > (checkData.license_expiry || '') && checkData.license_expiry !== '0000-00-00'
        if (isKeyExpired) {
          const errorText = 'This activation key has expired'
          this._notifyAutoRegisterError(errorText)
          return { success: false, error: errorText }
        }

        const activations = calculateActivations(checkData)
        const fingerprints = [checkData.fingerprint_1, checkData.fingerprint_2, checkData.fingerprint_3]
        const isDeviceRegistered = fingerprints.includes(machineId)

        if (activations >= 3 && !isDeviceRegistered) {
          const errorText = 'The number of activations has been exceeded'
          this._notifyAutoRegisterError(errorText)
          return { success: false, error: errorText }
        }

        const activateData = await this.activateLicense(licenseCode)

        if (activateData?.activated && activateData.license) {
          await this.updateRegInfo(activateData.license)
          return { success: true }
        }

        const errorText = activateData?.message || 'Registration failed'
        this._notifyAutoRegisterError(errorText)
        return { success: false, error: errorText }
      } catch (error) {
        console.error('Auto registration failed:', error)
        const errorText = getErrorMessage(error, 'An error occurred while activating the application')
        this._notifyAutoRegisterError(errorText)
        return { success: false, error: errorText }
      }
    },

    _notifyAutoRegisterError(text: string) {
      useNotificationsStore().setNotification({
        type: 'error',
        text,
      })
    },
  },
  getters: {
    regInfo(): LicenseInfo | '' {
      try {
        if (this._regInfoCache && typeof this._regInfoCache === 'object') {
          return this._regInfoCache
        }

        const registration = readRegistrationFromConfig() || readRegistrationFromDbSettings()
        if (!registration) {
          return ''
        }

        const parsed = parseRegistrationString(registration)
        if (!parsed || typeof parsed !== 'object') {
          console.warn('Invalid registration data in config')
          return ''
        }

        this._regInfoCache = parsed
        return parsed
      } catch (error) {
        console.error('regInfo getter error', error)
        return ''
      }
    },

    reg(state): boolean {
      try {
        const info = this.regInfo
        if (!info || typeof info !== 'object' || Object.keys(info).length === 0) {
          return false
        }

        const today = new Date().toISOString().substring(0, 10)
        if (today > (info.license_expiry || '')) {
          return false
        }

        if (!state.machineId) {
          return false
        }

        const arr = [info.fingerprint_1, info.fingerprint_2, info.fingerprint_3]
        return arr.includes(state.machineId)
      } catch (error) {
        console.error('reg getter error:', error)
        return false
      }
    },
  },
})

export default useRegistrationStore

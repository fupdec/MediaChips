import { z } from 'zod'
import type { LicenseInfo } from '@/types/stores'

export const LicenseInfoSchema = z.object({
  license_code: z.string().optional(),
  license_created: z.string().optional(),
  license_expiry: z.string().optional(),
  license_type: z.string().optional(),
  client_email: z.string().optional(),
  client_name: z.string().optional(),
  fingerprint_1: z.string().optional(),
  fingerprint_2: z.string().optional(),
  fingerprint_3: z.string().optional(),
}).passthrough()

export const LicenseActivateResponseSchema = z.object({
  activated: z.boolean().optional(),
  license: LicenseInfoSchema.optional(),
  message: z.string().optional(),
}).passthrough()

export const LicenseDeactivateOthersResponseSchema = z.object({
  success: z.boolean().optional(),
  deactivated_count: z.number().optional(),
  license: LicenseInfoSchema.optional(),
  message: z.string().optional(),
}).passthrough()

export function parseLicenseInfo(data: unknown): LicenseInfo | null {
  if (data == null) return null

  const result = LicenseInfoSchema.safeParse(data)
  if (!result.success) {
    console.warn('[license] Failed to parse license info:', result.error.issues)
    return null
  }

  return result.data as LicenseInfo
}

export function parseLicenseActivateResponse(data: unknown) {
  if (data == null) return null

  const result = LicenseActivateResponseSchema.safeParse(data)
  if (!result.success) {
    console.warn('[license] Failed to parse activate response:', result.error.issues)
    return null
  }

  return result.data
}

export function parseLicenseDeactivateOthersResponse(data: unknown) {
  if (data == null) return null

  const result = LicenseDeactivateOthersResponseSchema.safeParse(data)
  if (!result.success) {
    console.warn('[license] Failed to parse deactivate-others response:', result.error.issues)
    return null
  }

  return result.data
}

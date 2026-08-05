import {z} from 'zod'

const PluginManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  icon: z.string().optional(),
  engines: z.object({
    mediachips: z.string().min(1),
  }).passthrough(),
  requiresAdult: z.boolean().optional(),
  permissions: z.array(z.string()).default([]),
  mainEntry: z.string().nullable().optional(),
  uiEntry: z.string().nullable().optional(),
}).passthrough()

export const PluginCatalogEntrySchema = z.object({
  manifest: PluginManifestSchema,
  source: z.enum(['bundled', 'user', 'planned']),
  state: z.enum(['planned', 'installed', 'enabled', 'disabled', 'error']),
  uiEntry: z.string().nullable().optional(),
  mainEntry: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  enabled: z.boolean(),
}).passthrough()

export const PluginCatalogListSchema = z.array(PluginCatalogEntrySchema)

export const PluginUninstallResponseSchema = z.object({
  ok: z.literal(true),
}).passthrough()

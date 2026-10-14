import {z} from 'zod'

const safeText = (min = 0, max = 2048) => z.string().min(min).max(max).refine(v => !/[\x00-\x1f\x7f]/.test(v), 'Control characters are not allowed')
export const NasConnectionSchema = z.object({
  name: safeText(1, 100),
  protocol: z.enum(['sftp', 'ftp', 'ftps']),
  host: z.string().min(1).max(253).refine(v => /^[a-zA-Z0-9.:[\]_-]+$/.test(v), 'Enter a host name or IP, without a URL'),
  port: z.number().int().min(1).max(65535),
  username: safeText(1, 256),
  root: safeText(1).refine(v => v.startsWith('/') && !v.includes('\\') && !v.split('/').includes('..'), 'Use an absolute remote folder'),
  password: z.string().max(4096).optional(),
  privateKey: z.string().max(65536).optional(),
  passphrase: z.string().max(4096).optional(),
  hostFingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.protocol !== 'sftp' && v.privateKey) ctx.addIssue({code: 'custom', message: 'SSH keys require SFTP'})
  if (v.protocol !== 'sftp' && /[\r\n\x00]/.test(v.password || '')) ctx.addIssue({code: 'custom', message: 'FTP passwords cannot contain protocol control characters'})
})
export type NasConnectionInput = z.infer<typeof NasConnectionSchema>
export type NasConnection = Omit<NasConnectionInput, 'password' | 'privateKey' | 'passphrase'> & {
  id: string; hasCredentials: boolean; hasPassword: boolean; hasPrivateKey: boolean
}
export type NasEntry = {name: string; path: string; isDirectory: boolean; size: number; modifiedAt?: number; mediaId?: number | null}
export type NasDirectoryResult = {path: string; entries: NasEntry[]; truncated: boolean}
export const NasPathSchema = z.object({path: safeText().default('')}).strict()
export const NasImportSchema = z.object({connectionId: z.string().uuid(), path: safeText(1)}).strict()
export const NasBatchImportSchema = z.object({connectionId: z.string().uuid(), paths: z.array(safeText(1)).min(1).max(20)}).strict()
export type NasImportResult = {path: string} & (
  {ok: true; id: number; title: string; created: boolean} | {ok: false; code: string; message: string}
)

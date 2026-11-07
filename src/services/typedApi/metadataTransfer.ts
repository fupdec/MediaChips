import {apiClient} from '../apiClient'
import type {MetadataBundle, MetadataPreview, MetadataResolution} from '@shared/metadataTransfer'
const base = '/api/metadata-transfer'
export interface SidecarPreview {
  token: string
  files: Array<{path: string; exists: boolean}>
  written: boolean
}
export const metadataTransferApi = {
  export: (mediaIds: number[]) => apiClient.post<MetadataBundle>(`${base}/export`, {mediaIds}),
  preview: (bundle: MetadataBundle) => apiClient.post<MetadataPreview>(`${base}/preview`, bundle),
  previewFile: (filePath: string) => apiClient.post<{bundle: MetadataBundle; preview: MetadataPreview}>(`${base}/preview-file`, {filePath}),
  import: (bundle: MetadataBundle, token: string, resolutions: Record<string, MetadataResolution>) => apiClient.post<MetadataPreview>(`${base}/import`, {bundle, token, resolutions}),
  sidecars: (mediaIds: number[], formats: string[], token?: string) => apiClient.post<SidecarPreview>(`${base}/sidecars`, {mediaIds, formats, token}),
}

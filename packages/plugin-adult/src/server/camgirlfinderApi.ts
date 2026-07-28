import axios from 'axios'

export const CAMGIRLFINDER_API_BASE = 'https://api.camgirlfinder.to'
export const CAMGIRLFINDER_USER_AGENT = 'MediaChips/1.0 (+https://github.com/fupdec/MediaChips)'

export const CAMGIRLFINDER_PLATFORMS: Record<string, string> = {
  atv: 'AmateurTV',
  bc: 'BongaCams',
  c4: 'Cam4',
  cb: 'Chaturbate',
  cs: 'CamSoda',
  ctv: 'CherryTV',
  f4f: 'Flirt4Free',
  im: 'ImLive',
  lj: 'LiveJasmin',
  mfc: 'MyFreeCams',
  sc: 'StripChat',
  sm: 'Streamate',
  sr: 'StreamRay',
  stv: 'ShowUpTV',
  xl: 'XloveCam',
}

export type CamGirlFinderGender = 'f' | 'm' | 'c' | 't'
export type CamGirlFinderProbability = 'high' | 'medium' | 'low'
export type CamGirlFinderJobStatus = 'active' | 'finished' | 'failed' | 'noface'

export interface CamGirlFinderPredictionUrls {
  profile: string
  externalProfile: string
  faceImage: string
  fullImage: string
}

export interface CamGirlFinderPrediction {
  platform: string
  model: string
  gender: CamGirlFinderGender | string
  seen: string
  accountSeen: string
  distance: number
  probability: CamGirlFinderProbability | string
  urls: CamGirlFinderPredictionUrls
}

export interface CamGirlFinderJob {
  id: string
  status: CamGirlFinderJobStatus | string
  error?: string | null
  created: string
  duration: number
  urls: {
    job: string
    fullImage: string
    faceImage?: string
  }
  predictions?: CamGirlFinderPrediction[]
}

export interface CamGirlFinderPerson {
  person: number
  faces: number
  seen: string
  firstSeen: string
  lastSeen: string
  urls: {
    faceImage: string
    fullImage: string
  }
}

export interface CamGirlFinderAccount {
  name: string
  platform: string
  gender: CamGirlFinderGender | string
  distance?: number
  faces?: number
  firstSeen: string
  lastSeen: string
  persons: CamGirlFinderPerson[]
  urls: {
    profile: string
    externalProfile: string
  }
  schedule?: number[][]
}

export interface CamGirlFinderNameSearchParams {
  model: string
  platform?: string
  gender?: string
}

type AxiosLikeError = {
  response?: {status?: number; data?: {error?: {message?: string}; message?: string}}
  message?: string
}

function apiErrorMessage(err: unknown): string {
  const error = err as AxiosLikeError
  const fromBody = error.response?.data?.error?.message || error.response?.data?.message
  if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim()
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim()
  return 'CamGirlFinder request failed'
}

function createClient() {
  return axios.create({
    baseURL: CAMGIRLFINDER_API_BASE,
    timeout: 45000,
    headers: {
      'User-Agent': CAMGIRLFINDER_USER_AGENT,
      Accept: 'application/json',
    },
    validateStatus: (status) => status >= 200 && status < 300,
  })
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function platformLabel(platform: string): string {
  const key = String(platform || '').trim().toLowerCase()
  return CAMGIRLFINDER_PLATFORMS[key] || String(platform || '').trim() || 'Unknown'
}

function wrapApiError(err: unknown): Error {
  return new Error(apiErrorMessage(err))
}

export async function getCamGirlFinderJob(jobId: string): Promise<CamGirlFinderJob> {
  const id = String(jobId || '').trim()
  if (!id) throw new Error('jobId is required')

  try {
    const response = await createClient().get<CamGirlFinderJob>(`/jobs/${encodeURIComponent(id)}`)
    return response.data
  } catch (err) {
    throw wrapApiError(err)
  }
}

export async function waitForCamGirlFinderJob(
  jobId: string,
  {
    timeoutMs = 30000,
    intervalMs = 400,
  }: {timeoutMs?: number; intervalMs?: number} = {},
): Promise<CamGirlFinderJob> {
  const started = Date.now()
  let job = await getCamGirlFinderJob(jobId)

  while (job.status === 'active') {
    if (Date.now() - started > timeoutMs) {
      throw new Error('CamGirlFinder search timed out')
    }
    await sleep(intervalMs)
    job = await getCamGirlFinderJob(jobId)
  }

  return job
}

export async function searchCamGirlFinderByImage(
  image: Buffer,
  _filename = 'face.jpg',
): Promise<CamGirlFinderJob> {
  if (!image?.length) throw new Error('image data is required')

  try {
    const response = await createClient().post<CamGirlFinderJob>('/search', image, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      maxBodyLength: 12 * 1024 * 1024,
      maxContentLength: 12 * 1024 * 1024,
    })

    const job = response.data
    if (job.status === 'active') {
      return waitForCamGirlFinderJob(job.id)
    }
    return job
  } catch (err) {
    throw wrapApiError(err)
  }
}

export async function searchCamGirlFinderByUrl(imageUrl: string): Promise<CamGirlFinderJob> {
  const url = String(imageUrl || '').trim()
  if (!url) throw new Error('url is required')

  try {
    const response = await createClient().get<CamGirlFinderJob>('/search', {
      params: {url},
    })
    const job = response.data
    if (job.status === 'active') {
      return waitForCamGirlFinderJob(job.id)
    }
    return job
  } catch (err) {
    throw wrapApiError(err)
  }
}

export async function searchCamGirlFinderModels(
  params: CamGirlFinderNameSearchParams,
): Promise<CamGirlFinderAccount[]> {
  const model = String(params.model || '').trim()
  if (model.length < 3 || model.length > 50) {
    throw new Error('model must be between 3 and 50 characters')
  }

  try {
    const query: Record<string, string> = {model}
    const platform = String(params.platform || '').trim()
    const gender = String(params.gender || '').trim()
    if (platform) query.platform = platform
    if (gender) query.gender = gender

    const response = await createClient().get<CamGirlFinderAccount[]>('/models/search', {
      params: query,
    })
    return Array.isArray(response.data) ? response.data : []
  } catch (err) {
    throw wrapApiError(err)
  }
}

export async function getCamGirlFinderAccount(
  platform: string,
  model: string,
): Promise<CamGirlFinderAccount> {
  const platformKey = String(platform || '').trim()
  const modelName = String(model || '').trim()
  if (!platformKey || !modelName) throw new Error('platform and model are required')

  try {
    const response = await createClient().get<CamGirlFinderAccount>(
      `/models/${encodeURIComponent(platformKey)}/${encodeURIComponent(modelName)}`,
    )
    return response.data
  } catch (err) {
    throw wrapApiError(err)
  }
}

export async function getCamGirlFinderSimilar(
  platform: string,
  model: string,
): Promise<Record<string, CamGirlFinderPrediction[]>> {
  const platformKey = String(platform || '').trim()
  const modelName = String(model || '').trim()
  if (!platformKey || !modelName) throw new Error('platform and model are required')

  try {
    const response = await createClient().get<Record<string, CamGirlFinderPrediction[]>>(
      `/models/${encodeURIComponent(platformKey)}/${encodeURIComponent(modelName)}/similar`,
    )
    return response.data && typeof response.data === 'object' ? response.data : {}
  } catch (err) {
    throw wrapApiError(err)
  }
}

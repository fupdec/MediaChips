import {apiClient} from '@/services/apiClient'
import {API_ROUTES} from '@shared/api/routes'
import axios from 'axios'
import type {CamGirlFinderMappedPerformer} from '../types/camgirlfinder'

export interface CamGirlFinderSearchParams {
  mode?: 'face' | 'name'
  query?: string
  cropPath?: string
  imageUrl?: string
  platform?: string
  gender?: string
  includeSimilar?: boolean
  limit?: number
}

export interface CamGirlFinderSearchResponse {
  mode: 'face' | 'name'
  jobId?: string
  status?: string
  duration?: number
  message?: string
  urls?: {
    job?: string
    fullImage?: string
    faceImage?: string
  }
  data: CamGirlFinderMappedPerformer[]
}

function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) return message
  }

  if (error instanceof Error && error.message) return error.message
  return 'CamGirlFinder search failed'
}

export async function searchCamGirlFinder(
  params: CamGirlFinderSearchParams,
): Promise<CamGirlFinderSearchResponse> {
  try {
    const response = await apiClient.post(API_ROUTES.scraperCamGirlFinderSearch, params)
    return response.data as CamGirlFinderSearchResponse
  } catch (error) {
    console.error('searchCamGirlFinder error', error)
    throw new Error(extractApiErrorMessage(error))
  }
}

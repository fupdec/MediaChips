import { apiClient } from '@/services/apiClient'
import { API_ROUTES } from '@shared/api/routes'
import { parseScraperPerformerSearchResponse } from '../schemas/scraper'
import type { ScraperPerformerSearchResponse } from '../types/scraper'
import axios from 'axios'

function extractApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) return message
  }

  if (error instanceof Error && error.message) return error.message
  return 'Performer search failed'
}

export async function searchScraperPerformers(
  params: { gender?: string; page?: number; q?: string },
): Promise<ScraperPerformerSearchResponse | null> {
  try {
    const response = await apiClient.get(API_ROUTES.scraperSearchPerformers, { params })
    return parseScraperPerformerSearchResponse(response.data)
  } catch (error) {
    console.error('searchScraperPerformers error', error)
    throw new Error(extractApiErrorMessage(error), { cause: error })
  }
}

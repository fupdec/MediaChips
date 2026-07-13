export interface BulkScrapeStatusCounts {
  total: number
  pending: number
  searching: number
  done: number
  notFound: number
  error: number
  cancelled: number
}

export function countBulkScrapeStatuses(
  items: Array<{ status?: string; error?: string }>,
): BulkScrapeStatusCounts {
  const counts: BulkScrapeStatusCounts = {
    total: items.length,
    pending: 0,
    searching: 0,
    done: 0,
    notFound: 0,
    error: 0,
    cancelled: 0,
  }

  for (const item of items) {
    if (item.error === 'cancelled') {
      counts.cancelled += 1
      continue
    }

    switch (item.status) {
      case 'searching':
        counts.searching += 1
        break
      case 'done':
        counts.done += 1
        break
      case 'not_found':
        counts.notFound += 1
        break
      case 'error':
        counts.error += 1
        break
      default:
        counts.pending += 1
        break
    }
  }

  return counts
}

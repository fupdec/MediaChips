export type LibraryNavActiveLink = {
  to: string
  exact?: boolean
}

export type LibraryNavActiveRoute = {
  path: string
  query: Record<string, unknown>
}

/**
 * Route-based active state for library nav links (bottom bar + sidebar).
 * Matches path, and when `to` has a query string, also matches those params.
 */
export function isLibraryNavLinkActive(
  link: LibraryNavActiveLink,
  route: LibraryNavActiveRoute,
): boolean {
  const targetPath = link.to.split('?')[0]
  const targetQuery = new URL(link.to, 'http://local').searchParams

  if (route.path !== targetPath) return false
  if (!link.to.includes('?')) return link.exact ? route.path === targetPath : true

  for (const [key, value] of targetQuery.entries()) {
    if (String(route.query[key] ?? '') !== value) return false
  }
  return true
}

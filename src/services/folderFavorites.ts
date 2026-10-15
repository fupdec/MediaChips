export type FolderFavorite = {path: string; title: string; pathTitles?: Record<string, string>}
const key = (scope: string) => `mediachips.folder-favorites.${encodeURIComponent(scope)}`
export function loadFolderFavorites(scope: string): FolderFavorite[] {
  try {
    const data = JSON.parse(localStorage.getItem(key(scope)) || '[]')
    if (!Array.isArray(data)) return []
    return data.filter(item => item && typeof item.path === 'string' && typeof item.title === 'string').slice(0, 100).map(item => ({
      path: item.path, title: item.title,
      pathTitles: item.pathTitles && typeof item.pathTitles === 'object'
        ? Object.fromEntries(Object.entries(item.pathTitles).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {},
    }))
  } catch { return [] }
}
export function saveFolderFavorites(scope: string, favorites: FolderFavorite[]): void {
  try { localStorage.setItem(key(scope), JSON.stringify(favorites.slice(0, 100))) }
  catch { /* Browsing still works if local storage is unavailable. */ }
}

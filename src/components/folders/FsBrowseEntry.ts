export type FsBrowseEntry = {
  name: string
  path: string
  isDirectory: boolean
  size: number | null
  mtimeMs: number | null
  extension: string | null
  inLibrary: boolean
  addable: boolean
}
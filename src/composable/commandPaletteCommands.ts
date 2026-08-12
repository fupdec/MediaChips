export type CommandPaletteGroup = 'navigation' | 'actions' | 'settings' | 'help'

export type CommandPaletteCommand = {
  id: string
  title: string
  subtitle?: string
  icon: string
  group: CommandPaletteGroup
  keywords?: string[]
  shortcut?: string
  run: () => void | Promise<void>
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Score match quality; higher is better. Returns -1 when no match. */
export function scoreCommandMatch(command: CommandPaletteCommand, query: string): number {
  const q = normalize(query)
  if (!q) return 0

  const title = normalize(command.title)
  const subtitle = normalize(command.subtitle || '')
  const keywords = (command.keywords || []).map(normalize).filter(Boolean)

  if (title === q) return 100
  if (title.startsWith(q)) return 90
  if (title.includes(q)) return 70

  for (const keyword of keywords) {
    if (keyword === q) return 65
    if (keyword.startsWith(q)) return 55
    if (keyword.includes(q)) return 45
  }

  if (subtitle.includes(q)) return 35

  // Token AND match across title + keywords
  const haystack = [title, subtitle, ...keywords].join(' ')
  const tokens = q.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && tokens.every((token) => haystack.includes(token))) {
    return 30
  }

  return -1
}

export function filterCommandPaletteCommands(
  commands: CommandPaletteCommand[],
  query: string,
): CommandPaletteCommand[] {
  const scored = commands
    .map((command) => ({command, score: scoreCommandMatch(command, query)}))
    .filter((row) => row.score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.command.title.localeCompare(b.command.title)
    })

  return scored.map((row) => row.command)
}

export const COMMAND_PALETTE_GROUP_ORDER: CommandPaletteGroup[] = [
  'navigation',
  'actions',
  'settings',
  'help',
]

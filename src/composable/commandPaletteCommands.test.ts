import {describe, expect, it} from 'vitest'
import {
  filterCommandPaletteCommands,
  scoreCommandMatch,
  type CommandPaletteCommand,
} from './commandPaletteCommands'

function cmd(partial: Partial<CommandPaletteCommand> & Pick<CommandPaletteCommand, 'id' | 'title'>): CommandPaletteCommand {
  return {
    icon: 'mdi-circle',
    group: 'actions',
    run: () => undefined,
    ...partial,
  }
}

describe('commandPaletteCommands', () => {
  it('ranks exact and prefix title matches higher', () => {
    const settings = cmd({id: 'settings', title: 'Settings'})
    const search = cmd({id: 'search', title: 'Search library'})
    expect(scoreCommandMatch(settings, 'settings')).toBeGreaterThan(
      scoreCommandMatch(search, 'settings'),
    )
    expect(scoreCommandMatch(search, 'sear')).toBeGreaterThan(
      scoreCommandMatch(settings, 'sear'),
    )
  })

  it('matches keywords and filters non-matches', () => {
    const commands = [
      cmd({id: 'prep', title: 'Prepare library', keywords: ['wizard', 'health']}),
      cmd({id: 'home', title: 'Home'}),
    ]
    expect(filterCommandPaletteCommands(commands, 'wizard').map((c) => c.id)).toEqual(['prep'])
    expect(filterCommandPaletteCommands(commands, 'zzzz')).toEqual([])
  })

  it('returns all commands for empty query', () => {
    const commands = [
      cmd({id: 'b', title: 'Bravo'}),
      cmd({id: 'a', title: 'Alpha'}),
    ]
    expect(filterCommandPaletteCommands(commands, '').map((c) => c.id)).toEqual(['a', 'b'])
  })
})

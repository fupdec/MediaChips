/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {getAppMenuLabels} from '../shared/electron/appMenuI18n'
import {DEFAULT_APP_MENU_STATE} from '../shared/electron/appMenuState'
import {buildAppMenuTemplate} from './appMenu'

function labelsOf(items: unknown): string[] {
  return (items as Array<{label?: string}>)
    .map((item) => item.label)
    .filter((label): label is string => Boolean(label))
}

function findMenu(template: ReturnType<typeof buildAppMenuTemplate>, label: string) {
  return template.find((item) => item.label === label)
}

function submenuOf(template: ReturnType<typeof buildAppMenuTemplate>, menuLabel: string) {
  const menu = findMenu(template, menuLabel)
  return (menu?.submenu || []) as Array<{
    label?: string
    type?: string
    checked?: boolean
    enabled?: boolean
    submenu?: unknown
    role?: string
  }>
}

function nestedSubmenu(
  items: Array<{label?: string; submenu?: unknown}>,
  label: string,
) {
  const item = items.find((entry) => entry.label === label)
  return (item?.submenu || []) as Array<{label?: string; type?: string; checked?: boolean}>
}

describe('buildAppMenuTemplate', () => {
  const labels = getAppMenuLabels('en')

  function build(options: {isMac?: boolean; localAiEnabled?: boolean} = {}) {
    return buildAppMenuTemplate({
      isMac: options.isMac ?? false,
      localAiEnabled: options.localAiEnabled ?? false,
      appName: 'mediaChips',
      labels,
      state: {
        ...DEFAULT_APP_MENU_STATE,
        theme: 'dark',
        sfwMode: true,
        locale: 'en',
        gapSize: 'm',
        playInSystemPlayer: true,
      },
      sendMenuAction: () => {},
      onLock: () => {},
      onExit: () => {},
    })
  }

  it('puts Settings in the App menu on Windows/Linux', () => {
    const template = build({isMac: false})
    expect(labelsOf(template)).toEqual(['App', 'File', 'View', 'Help'])
    expect(labelsOf(submenuOf(template, 'App'))).toContain('Settings')
    expect(labelsOf(submenuOf(template, 'App'))).toContain('Minimize to Tray')
  })

  it('keeps Settings in the macOS application menu', () => {
    const template = build({isMac: true})
    expect(labelsOf(template)[0]).toBe('mediaChips')
    expect(labelsOf(submenuOf(template, 'mediaChips'))).toContain('Settings...')
    expect(labelsOf(submenuOf(template, 'App'))).toContain('Minimize to Tray')
    expect(labelsOf(submenuOf(template, 'App'))).not.toContain('Settings')
  })

  it('exposes theme, language, SFW, navigation, playback, and gap size in View', () => {
    const view = submenuOf(build(), 'View')
    const viewLabels = labelsOf(view)
    expect(viewLabels).toEqual(expect.arrayContaining([
      'Theme',
      'Language',
      'SFW Mode',
      'Navigation',
      'Sidebar',
      'Inspector',
      'Gap Size',
      'Playback',
    ]))
    expect(viewLabels).not.toContain('Toggle Theme')

    const language = nestedSubmenu(view, 'Language')
    expect(language).toHaveLength(8)
    expect(language.some((item) => item.label === 'English' && item.checked)).toBe(true)
    expect(language.some((item) => item.label === 'Русский')).toBe(true)

    const theme = nestedSubmenu(view, 'Theme')
    expect(theme.map((item) => item.label)).toEqual(['System', 'Light', 'Dark'])
    expect(theme.find((item) => item.label === 'Dark')?.checked).toBe(true)

    expect(view.find((item) => item.label === 'SFW Mode')?.checked).toBe(true)

    const playback = nestedSubmenu(view, 'Playback')
    expect(playback.map((item) => item.label)).toEqual([
      'Open in System Player',
      'Separate Player Window',
      'Sound on Video Preview',
    ])
  })

  it('omits an explicit fullscreen item on macOS so AppKit does not duplicate it', () => {
    const macView = submenuOf(build({isMac: true}), 'View')
    expect(macView.some((item) => item.role === 'togglefullscreen')).toBe(false)
    expect(findMenu(build({isMac: true}), 'View')?.role).toBe('viewMenu')
  })

  it('keeps an explicit fullscreen item on Windows and Linux', () => {
    const view = submenuOf(build({isMac: false}), 'View')
    expect(view.some((item) => item.role === 'togglefullscreen')).toBe(true)
  })
})

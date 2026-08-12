import {describe, expect, it, vi} from 'vitest'
import {createMenuActionDelivery} from './menuActionDelivery'

function mockWindow(options: {
  loading?: boolean
  destroyed?: boolean
} = {}) {
  const send = vi.fn()
  const once = vi.fn()
  return {
    isDestroyed: () => Boolean(options.destroyed),
    webContents: {
      isDestroyed: () => Boolean(options.destroyed),
      isLoadingMainFrame: () => Boolean(options.loading),
      send,
      once,
    },
  }
}

describe('createMenuActionDelivery', () => {
  it('sends immediately when the window is ready', () => {
    const win = mockWindow()
    const delivery = createMenuActionDelivery({
      getMainWindow: () => win as never,
    })

    delivery.send('checkUpdates')

    expect(win.webContents.send).toHaveBeenCalledWith('menuAction', 'checkUpdates')
  })

  it('queues and recreates the window when it is missing', () => {
    const showMainWindow = vi.fn()
    let win: ReturnType<typeof mockWindow> | null = null
    const delivery = createMenuActionDelivery({
      getMainWindow: () => win as never,
      showMainWindow,
    })

    delivery.send('checkUpdates')
    expect(showMainWindow).toHaveBeenCalled()
    expect(win).toBeNull()

    win = mockWindow()
    delivery.flush()
    expect(win.webContents.send).toHaveBeenCalledWith('menuAction', 'checkUpdates')
  })

  it('waits for did-finish-load while the frame is loading', () => {
    const win = mockWindow({loading: true})
    const delivery = createMenuActionDelivery({
      getMainWindow: () => win as never,
    })

    delivery.send('settings')
    expect(win.webContents.send).not.toHaveBeenCalled()
    expect(win.webContents.once).toHaveBeenCalledWith('did-finish-load', expect.any(Function))

    const onLoad = win.webContents.once.mock.calls[0]?.[1] as () => void
    win.webContents.isLoadingMainFrame = () => false
    onLoad()

    expect(win.webContents.send).toHaveBeenCalledWith('menuAction', 'settings')
  })
})

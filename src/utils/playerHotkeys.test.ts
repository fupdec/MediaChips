import { describe, expect, it, vi } from 'vitest'
import { handlePlayerKeydown } from '@/utils/playerHotkeys'

describe('handlePlayerKeydown seek', () => {
  it('uses absolute store time for arrow seek during live transcode', () => {
    const playerJumpTo = vi.fn()
    const event = new KeyboardEvent('keydown', { code: 'ArrowRight' })

    handlePlayerKeydown(event, {
      playerStore: {
        active: true,
        currentTime: 315,
        player: { currentTime: 15 },
        playerJumpTo,
      },
    })

    expect(playerJumpTo).toHaveBeenCalledWith(325)
  })

  it('falls back to element time when store time is unavailable', () => {
    const playerJumpTo = vi.fn()
    const event = new KeyboardEvent('keydown', { code: 'ArrowLeft' })

    handlePlayerKeydown(event, {
      playerStore: {
        active: true,
        player: { currentTime: 42 },
        playerJumpTo,
      },
    })

    expect(playerJumpTo).toHaveBeenCalledWith(32)
  })
})

describe('handlePlayerKeydown studio', () => {
  it('exits studio on Escape instead of closing the player', () => {
    const exitStudioLayer = vi.fn()
    const closePlayer = vi.fn()
    const event = new KeyboardEvent('keydown', { code: 'Escape' })

    const handled = handlePlayerKeydown(event, {
      playerStore: { active: true, studioMode: true },
      controls: { exitStudioLayer },
      closePlayer,
    })

    expect(handled).toBe(true)
    expect(exitStudioLayer).toHaveBeenCalled()
    expect(closePlayer).not.toHaveBeenCalled()
  })

  it('toggles studio with Shift+M', () => {
    const toggleStudioMode = vi.fn()
    const event = new KeyboardEvent('keydown', { code: 'KeyM', shiftKey: true })

    handlePlayerKeydown(event, {
      playerStore: { active: true, studioMode: false },
      controls: { toggleStudioMode },
    })

    expect(toggleStudioMode).toHaveBeenCalled()
  })
})

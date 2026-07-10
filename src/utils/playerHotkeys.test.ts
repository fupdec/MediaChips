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

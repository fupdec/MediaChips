import { describe, expect, it, vi } from 'vitest'
import { handlePlayerKeydown } from '@/utils/playerHotkeys'
import { createDefaultPlayerFilters } from '@/utils/playerVideoFilters'

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

describe('handlePlayerKeydown trim', () => {
  it('exits trim on Escape instead of closing the player', () => {
    const exitTrimMode = vi.fn()
    const closePlayer = vi.fn()
    const event = new KeyboardEvent('keydown', { code: 'Escape' })

    const handled = handlePlayerKeydown(event, {
      playerStore: { active: true, trimMode: true },
      controls: { exitTrimMode },
      closePlayer,
    })

    expect(handled).toBe(true)
    expect(exitTrimMode).toHaveBeenCalled()
    expect(closePlayer).not.toHaveBeenCalled()
  })

  it('sets in/out points while trim mode is on', () => {
    const setTrimIn = vi.fn()
    const setTrimOut = vi.fn()
    const toggleMarks = vi.fn()

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyI' }), {
      playerStore: { active: true, trimMode: true },
      controls: { setTrimIn, toggleMarks },
    })
    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyO' }), {
      playerStore: { active: true, trimMode: true },
      controls: { setTrimOut },
    })

    expect(setTrimIn).toHaveBeenCalled()
    expect(setTrimOut).toHaveBeenCalled()
    expect(toggleMarks).not.toHaveBeenCalled()
  })
})

describe('handlePlayerKeydown picture', () => {
  const createPictureStore = (overrides: Record<string, unknown> = {}) => ({
    active: true,
    aspectMode: 'auto' as const,
    rotation: 0 as const,
    flipH: false,
    flipV: false,
    zoom: 1,
    panX: 0,
    panY: 0,
    videoFilters: createDefaultPlayerFilters(),
    changePlayerStatusText: vi.fn(),
    ...overrides,
  })

  it('cycles the aspect ratio with A and back with Shift+A', () => {
    const playerStore = createPictureStore()

    expect(handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyA' }), { playerStore })).toBe(true)
    expect(playerStore.aspectMode).toBe('4:3')

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyA', shiftKey: true }), { playerStore })
    expect(playerStore.aspectMode).toBe('auto')
  })

  it('rotates with R and Shift+R, flips with H and V, resets with 0', () => {
    const playerStore = createPictureStore()

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyR' }), { playerStore })
    expect(playerStore.rotation).toBe(90)
    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyR', shiftKey: true }), { playerStore })
    expect(playerStore.rotation).toBe(0)

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyH' }), { playerStore })
    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyV' }), { playerStore })
    expect([playerStore.flipH, playerStore.flipV]).toEqual([true, true])

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'Digit0' }), { playerStore })
    expect([playerStore.flipH, playerStore.flipV]).toEqual([false, false])
  })

  it('zooms with + and - and clamps at 100%', () => {
    const playerStore = createPictureStore()

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'Equal' }), { playerStore })
    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'NumpadAdd' }), { playerStore })
    expect(playerStore.zoom).toBe(1.5)

    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'Minus' }), { playerStore })
    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'NumpadSubtract' }), { playerStore })
    handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'Minus' }), { playerStore })
    expect(playerStore.zoom).toBe(1)
  })

  it('ignores picture hotkeys in audio mode and with modifiers', () => {
    const audioStore = createPictureStore({ isAudioMode: true })
    expect(handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyR' }), { playerStore: audioStore })).toBe(false)
    expect(audioStore.rotation).toBe(0)

    const playerStore = createPictureStore()
    expect(handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyR', ctrlKey: true }), { playerStore })).toBe(false)
    expect(playerStore.rotation).toBe(0)
  })
})

describe('handlePlayerKeydown A-B loop', () => {
  it('sets A, then B, then clears the loop with L', () => {
    const playerStore = {
      active: true,
      currentTime: 12,
      abLoop: { a: null as number | null, b: null as number | null },
      changePlayerStatusText: vi.fn(),
    }
    const press = () => handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyL' }), { playerStore })

    expect(press()).toBe(true)
    expect(playerStore.abLoop).toEqual({ a: 12, b: null })
    playerStore.currentTime = 40
    press()
    expect(playerStore.abLoop).toEqual({ a: 12, b: 40 })
    press()
    expect(playerStore.abLoop).toEqual({ a: null, b: null })
  })

  it('does nothing without loop state', () => {
    const handled = handlePlayerKeydown(new KeyboardEvent('keydown', { code: 'KeyL' }), { playerStore: { active: true } })
    expect(handled).toBe(false)
  })
})


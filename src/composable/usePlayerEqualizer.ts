import {watch} from 'vue'
import type {usePlayerStore} from '@/stores/player'
import {
  PLAYER_EQ_BANDS,
  isFlatEqualizer,
  normalizeEqGains,
} from '@/utils/playerEqualizer'

const STORAGE_KEY = 'mediachips.player.equalizer'
const SMOOTHING_SECONDS = 0.02

interface EqGraph {
  context: AudioContext
  filters: BiquadFilterNode[]
}

// A media element can be connected to Web Audio only once, so its graph lives as long as the element does.
const graphs = new WeakMap<HTMLMediaElement, EqGraph>()

function loadGains(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return normalizeEqGains(raw ? JSON.parse(raw) : null)
  } catch {
    return normalizeEqGains(null)
  }
}

function buildGraph(video: HTMLMediaElement): EqGraph | null {
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return null
  const context = new Context()
  const source = context.createMediaElementSource(video)
  const filters = PLAYER_EQ_BANDS.map((frequency, index) => {
    const filter = context.createBiquadFilter()
    filter.type = index === 0 ? 'lowshelf' : index === PLAYER_EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
    filter.frequency.value = frequency
    filter.Q.value = 1.4
    filter.gain.value = 0
    return filter
  })
  let node: AudioNode = source
  for (const filter of filters) {
    node.connect(filter)
    node = filter
  }
  node.connect(context.destination)
  return {context, filters}
}

/**
 * 10-band equalizer on the Web Audio API. The graph is created only when the curve first becomes non-flat,
 * because routing an element through Web Audio mutes cross-origin media that has no CORS headers (web video);
 * those are left alone. The curve is global, not per file, and is remembered between sessions.
 */
export function usePlayerEqualizer(playerStore: ReturnType<typeof usePlayerStore>) {
  playerStore.equalizerGains = loadGains()

  const apply = () => {
    const video = playerStore.player
    const gains = playerStore.equalizerGains
    if (!video || playerStore.isWebVideo) return
    let graph = graphs.get(video)
    if (!graph) {
      if (isFlatEqualizer(gains)) return
      try {
        graph = buildGraph(video) ?? undefined
      } catch {
        graph = undefined
      }
      if (!graph) return
      graphs.set(video, graph)
    }
    const {context, filters} = graph
    if (context.state === 'suspended') void context.resume().catch(() => {})
    filters.forEach((filter, index) => {
      filter.gain.setTargetAtTime(gains[index] ?? 0, context.currentTime, SMOOTHING_SECONDS)
    })
  }

  watch(() => [...playerStore.equalizerGains], gains => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(gains)) } catch { /* only this session */ }
    apply()
  })
  // A new media element (or a new file in it) must pick the curve up; a suspended context needs a user-started play.
  watch(() => [playerStore.player, playerStore.media?.id, playerStore.paused], apply, {immediate: true})
}

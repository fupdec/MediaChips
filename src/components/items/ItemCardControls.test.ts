import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, h, nextTick, reactive} from 'vue'
import ItemRating from './ItemRating.vue'
import ItemFavorite from './ItemFavorite.vue'
import type {MediaItem} from '@/types/stores'
const mocks = vi.hoisted(() => ({updateEntity: vi.fn(), updateItemField: vi.fn()}))
vi.mock('@/services/typedApi', () => ({typedApi: {updateEntity: mocks.updateEntity}}))
vi.mock('@/stores/items', () => ({useItemsStore: () => ({updateItemField: mocks.updateItemField})}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}))
let cleanup = () => {}
beforeEach(() => {vi.clearAllMocks(); mocks.updateEntity.mockResolvedValue({})})
afterEach(() => {cleanup(); vi.restoreAllMocks()})
async function settle() {await nextTick(); await Promise.resolve(); await nextTick()}
function mount(control: typeof ItemRating | typeof ItemFavorite) {
  const item = reactive({id: 7, rating: 0, favorite: 0}) as unknown as MediaItem
  mocks.updateItemField.mockImplementation(({field, value}) => {
    (item as unknown as Record<string, unknown>)[field] = value
  })
  const host = document.createElement('div')
  const app = createApp({render: () => h(control, {item, type: 'media'})})
  app.mount(host)
  cleanup = () => app.unmount()
  return {host, item}
}
describe('lightweight card controls', () => {
  it('uses eleven rating elements, saves half stars, and clears a repeated score', async () => {
    const {host} = mount(ItemRating)
    expect(host.querySelectorAll('*')).toHaveLength(11)
    const star = host.querySelector('.item-rating-native__star')!
    vi.spyOn(star, 'getBoundingClientRect').mockReturnValue({left: 0, width: 20} as DOMRect)
    star.dispatchEvent(new MouseEvent('click', {clientX: 2, bubbles: true}))
    await settle()
    expect(mocks.updateEntity).toHaveBeenLastCalledWith('media', 7, {rating: 0.5})
    star.dispatchEvent(new MouseEvent('click', {clientX: 2, bubbles: true}))
    await settle()
    expect(mocks.updateEntity).toHaveBeenLastCalledWith('media', 7, {rating: 0})
  })
  it('supports keyboard half steps and syncs refreshed values without writing them back', async () => {
    const {host, item} = mount(ItemRating)
    const slider = host.querySelector('[role="slider"]')!
    slider.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
    await settle()
    expect(mocks.updateEntity).toHaveBeenLastCalledWith('media', 7, {rating: 0.5})
    mocks.updateEntity.mockClear()
    item.rating = 4
    await settle()
    expect(slider.getAttribute('aria-valuenow')).toBe('4')
    expect(mocks.updateEntity).not.toHaveBeenCalled()
  })
  it('uses two favorite elements and saves the toggle', async () => {
    const {host} = mount(ItemFavorite)
    expect(host.querySelectorAll('*')).toHaveLength(2)
    const button = host.querySelector('button')!
    button.click()
    await settle()
    expect(mocks.updateEntity).toHaveBeenCalledWith('media', 7, {favorite: 1})
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })
  it('keeps the existing favorite value when saving fails', async () => {
    const {host, item} = mount(ItemFavorite)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.updateEntity.mockRejectedValueOnce(new Error('offline'))
    host.querySelector('button')!.click()
    await settle()
    expect(item.favorite).toBe(0)
    expect(host.querySelector('button')!.disabled).toBe(false)
  })
})

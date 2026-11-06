import {afterEach, expect, it, vi} from 'vitest'
import {createApp, defineComponent, h, nextTick, ref} from 'vue'
import SettingsSegmentedControl from './SettingsSegmentedControl.vue'

vi.mock('vuetify/lib/components/VIcon/index.mjs', () => ({VIcon: {render: () => null}}))

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

it('updates the selected sort and rendered order on click and keyboard input', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(defineComponent({
    setup() {
      const sort = ref('date')
      return () => h('div', [
        h(SettingsSegmentedControl, {
          modelValue: sort.value,
          'onUpdate:modelValue': value => { sort.value = String(value) },
          label: 'Sort by',
          items: [{value: 'date', title: 'Date'}, {value: 'size', title: 'Size'}],
        }),
        h('output', sort.value === 'date' ? 'Newest, Largest' : 'Largest, Newest'),
      ])
    },
  }))
  app.mount(host)
  cleanup = () => { app.unmount(); host.remove() }
  const buttons = host.querySelectorAll('button')
  buttons[1].click()
  await nextTick()
  expect(buttons[1].getAttribute('aria-checked')).toBe('true')
  expect(host.querySelector('output')?.textContent).toBe('Largest, Newest')
  buttons[1].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
  await nextTick()
  expect(buttons[0].getAttribute('aria-checked')).toBe('true')
  expect(host.querySelector('output')?.textContent).toBe('Newest, Largest')
})

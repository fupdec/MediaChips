import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import router from '@/router'
import { i18n, registerVuetifyForLocales } from '@/i18n/loadLocale'

// ============ VUETIFY SETUP ============
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import { createVueI18nAdapter } from 'vuetify/locale/adapters/vue-i18n'
import { useI18n } from 'vue-i18n'

const vuetify = createVuetify({
  locale: {
    adapter: createVueI18nAdapter({ i18n, useI18n }),
    messages: {
      en: i18n.global.getLocaleMessage('en'),
    },
  },

  defaults: {
    VProgress: {
      color: 'primary',
    },
    VCheckbox: {
      color: 'primary',
    },
    VSwitch: {
      color: 'primary',
    },
    VTextField: {
      color: 'primary',
    },
    VSelect: {
      color: 'primary',
    },
    VAutocomplete: {
      color: 'primary',
    },
    VSlider: {
      color: 'primary',
    },
  },

  theme: {
    defaultTheme: 'light',
    options: {
      customProperties: true,
    },
    icons: {
      iconfont: 'mdi',
    },
    themes: {
      light: {
        colors: {
          error: '#f24343',
        }
      },
      dark: {
        colors: {
          error: '#f24343',
        }
      },
    },
  },
} as Parameters<typeof createVuetify>[0])

registerVuetifyForLocales(vuetify)

// ============ GLOBAL EVENTS ============
import eventBus from '@/utils/eventBus'

// ============ PINIA STORE ============
import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'

// ============ PLUGINS ============
import operable from '@/plugins/operable'
import readable from '@/plugins/readable'

// ============ CREATE APP ============
const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(i18n)
app.use(vuetify)

app.provide('eventBus', eventBus)

const store = useAppStore()
const itemsStore = useItemsStore()

router.beforeEach((to, from, next) => {
  if (to.name !== from.name) {
    itemsStore.isSelect = false
    itemsStore.selection = []
    itemsStore.selected_last = null
    itemsStore.type = ''
    itemsStore.find_duplicates = false
  }
  next()
})

app.use(operable, { router, store })
app.use(readable, { router, store, i18n })

router.isReady().then(() => {
  app.mount('#app')

  if (import.meta.env.DEV) {
    import('@/composable/useOnboarding').then(({openOnboarding}) => {
      ;(window as Window & {__openOnboarding?: () => void}).__openOnboarding = openOnboarding
    })
  }
})

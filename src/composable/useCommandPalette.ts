import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useTheme} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import {useAppShell} from '@/composable/appShell'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {openLibrarySetupWizardQuery} from '@/composable/useLibrarySetupWizard'
import {useReviewModeLauncher} from '@/composable/useReviewModeLauncher'
import {useMediaInbox} from '@/composable/useMediaInbox'
import {useOpenMediaList} from '@/utils/openMediaList'
import {setOption} from '@/services/settingsService'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {buildInboxFilters} from '@/utils/homeMediaListFilters'
import {typedApi} from '@/services/typedApi'
import {LOCAL_AI_UI_ENABLED} from '@shared/features'
import {
  filterCommandPaletteCommands,
  type CommandPaletteCommand,
} from '@/composable/commandPaletteCommands'

function isItemsLibraryRoute(path: string): boolean {
  return path === '/media' || path.startsWith('/media/')
    || path === '/meta' || path.startsWith('/meta/')
    || path === '/tag' || path.startsWith('/tag/')
}

export function useCommandPaletteCommands(options: {
  /** Hide the "Search library" action when already inside Global Search. */
  excludeSearchAction?: boolean
} = {}) {
  const {t} = useI18n()
  const router = useRouter()
  const theme = useTheme()
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  const dialogsStore = useDialogsStore()
  const sessionFocusStore = useSessionFocusStore()
  const {
    clearFocus,
    browseWithFocus,
    browseWithoutFocus,
    openFocusTagPage,
    applyFocusTagToMediaIds,
  } = useSessionFocusActions()
  const appShell = useAppShell()
  const nav = useLibraryNavItems()
  const {openReviewMode} = useReviewModeLauncher()
  const {openInbox} = useMediaInbox()
  const {openMediaList} = useOpenMediaList()

  async function toggleTheme() {
    if (settingsStore.system_dark_mode === '1') {
      await setOption('0', 'system_dark_mode')
    }
    const nextValue = settingsStore.darkMode === '1' ? '0' : '1'
    await setOption(nextValue, 'darkMode')
    theme.global.name.value = nextValue === '1' ? 'dark' : 'light'
  }

  /** Home widget inbox: untagged/unrated media (distinct from watch-folder Media Inbox). */
  async function openHomeInbox() {
    try {
      const response = await typedApi.getHomeMedia({
        continueLimit: 0,
        favoritesLimit: 0,
        topViewsLimit: 0,
        inboxLimit: 500,
      })
      const ids = (response.data.inbox || [])
        .map((item) => Number(item.id))
        .filter((id) => Number.isFinite(id) && id > 0)

      if (ids.length) {
        await openMediaList({
          sortBy: 'createdAt',
          sortDir: 'desc',
          ids,
          scope: {kind: 'inbox', label: t('home.widgets.inbox')},
        })
        return
      }
    } catch (error) {
      console.error(error)
    }

    await openMediaList({
      sortBy: 'createdAt',
      sortDir: 'desc',
      filters: buildInboxFilters(),
    })
  }

  function openAddMedia() {
    const id = itemsStore.environment?.media_type_id
      ?? getDefaultMediaTypeId(appStore.mediaTypes)
    if (router.currentRoute.value.path !== '/media' && id != null) {
      void router.push(`/media?mediaTypeId=${id}`)
    }
    appShell.showAddMediaDialog()
  }

  const commands = computed((): CommandPaletteCommand[] => {
    const list: CommandPaletteCommand[] = []

    if (!options.excludeSearchAction) {
      list.push({
        id: 'search',
        title: t('commandPalette.actions.search'),
        subtitle: t('commandPalette.actions.search_hint'),
        icon: 'mdi-magnify',
        group: 'actions',
        keywords: ['find', 'global', 'lookup'],
        shortcut: '/',
        run: () => appShell.showGlobalSearch(),
      })
    }

    list.push(
      {
        id: 'add-media',
        title: t('commandPalette.actions.add_media'),
        icon: 'mdi-plus',
        group: 'actions',
        keywords: ['import', 'upload'],
        shortcut: 'a',
        run: () => openAddMedia(),
      },
      {
        id: 'prepare-library',
        title: t('commandPalette.actions.prepare_library'),
        subtitle: t('commandPalette.actions.prepare_library_hint'),
        icon: 'mdi-auto-fix',
        group: 'actions',
        keywords: ['wizard', 'health', 'backfill', 'clip', 'setup'],
        run: () => {
          void router.push({path: '/settings', query: openLibrarySetupWizardQuery()})
        },
      },
      {
        id: 'review-mode',
        title: t('commandPalette.actions.review_mode'),
        subtitle: t('commandPalette.actions.review_mode_hint'),
        icon: 'mdi-card-search-outline',
        group: 'actions',
        keywords: ['review', 'inbox', 'tag', 'rate', 'keyboard'],
        shortcut: 'r',
        run: () => { void openReviewMode() },
      },
      {
        id: 'media-inbox',
        title: t('commandPalette.actions.media_inbox'),
        subtitle: t('commandPalette.actions.media_inbox_hint'),
        icon: 'mdi-inbox-outline',
        group: 'actions',
        keywords: ['inbox', 'watch', 'new', 'triage', 'queue'],
        run: () => { openInbox() },
      },
      {
        id: 'review-inbox-pending',
        title: t('commandPalette.actions.review_inbox'),
        subtitle: t('commandPalette.actions.review_inbox_hint'),
        icon: 'mdi-inbox-arrow-up',
        group: 'actions',
        keywords: ['inbox', 'review', 'pending', 'triage', 'keyboard'],
        run: () => { openInbox('pending') },
      },
      {
        id: 'open-inbox',
        title: t('commandPalette.actions.open_inbox'),
        subtitle: t('commandPalette.actions.open_inbox_hint'),
        icon: 'mdi-inbox-arrow-down',
        group: 'actions',
        keywords: ['inbox', 'triage', 'review', 'untagged', 'new'],
        run: () => { void openHomeInbox() },
      },
      {
        id: 'browse-media-created',
        title: t('commandPalette.actions.browse_media_created'),
        subtitle: t('commandPalette.actions.browse_media_created_hint'),
        icon: 'mdi-calendar-plus',
        group: 'actions',
        keywords: ['calendar', 'created', 'date', 'added', 'date added', 'timeline', 'library'],
        run: () => {
          void openMediaList({
            sortBy: 'createdAt',
            sortDir: 'desc',
            groupBy: 'dateDay',
          })
        },
      },
      {
        id: 'media-trash',
        title: t('commandPalette.actions.media_trash'),
        subtitle: t('commandPalette.actions.media_trash_hint'),
        icon: 'mdi-delete-outline',
        group: 'actions',
        keywords: ['trash', 'bin', 'recycle', 'restore', 'undelete'],
        run: () => dialogsStore.openMediaTrash(),
      },
      {
        id: 'toggle-theme',
        title: t('commandPalette.actions.toggle_theme'),
        icon: 'mdi-theme-light-dark',
        group: 'actions',
        keywords: ['dark', 'light', 'mode'],
        run: () => { void toggleTheme() },
      },
      {
        id: 'toggle-filters',
        title: t('commandPalette.actions.toggle_filters'),
        icon: 'mdi-filter-outline',
        group: 'actions',
        keywords: ['filter'],
        shortcut: 'f',
        run: () => {
          if (!isItemsLibraryRoute(router.currentRoute.value.path)) {
            const id = getDefaultMediaTypeId(appStore.mediaTypes)
            if (id != null) void router.push(`/media?mediaTypeId=${id}`)
          }
          appStore.filters.visible = !appStore.filters.visible
        },
      },
      {
        id: 'toggle-select',
        title: t('commandPalette.actions.toggle_select'),
        icon: 'mdi-checkbox-multiple-marked-outline',
        group: 'actions',
        keywords: ['selection', 'multi'],
        shortcut: 's',
        run: () => {
          if (!isItemsLibraryRoute(router.currentRoute.value.path)) {
            const id = getDefaultMediaTypeId(appStore.mediaTypes)
            if (id != null) void router.push(`/media?mediaTypeId=${id}`)
          }
          itemsStore.isSelect = !itemsStore.isSelect
          if (!itemsStore.isSelect) {
            itemsStore.selection = []
            itemsStore.selected_last = null
            itemsStore.selectionAnchor = null
          }
        },
      },
      {
        id: 'nav-home',
        title: t('navigation.home'),
        icon: 'mdi-home-outline',
        group: 'navigation',
        keywords: ['start', 'dashboard'],
        run: () => { void router.push('/') },
      },
      {
        id: 'nav-all-tags',
        title: t('navigation.all_tags'),
        icon: 'mdi-tag-multiple-outline',
        group: 'navigation',
        keywords: ['tags', 'categories'],
        run: () => { void router.push('/tags') },
      },
      {
        id: 'nav-settings',
        title: t('navigation.settings'),
        icon: 'mdi-cog-outline',
        group: 'settings',
        keywords: ['preferences', 'options'],
        shortcut: 'ctrl+,',
        run: () => { void router.push('/settings') },
      },
      {
        id: 'help-shortcuts',
        title: t('commandPalette.actions.keyboard_shortcuts'),
        icon: 'mdi-keyboard-outline',
        group: 'help',
        keywords: ['hotkeys', 'keys'],
        shortcut: 'shift+/',
        run: () => appShell.showKeyboardShortcuts(),
      },
      {
        id: 'help-docs',
        title: t('commandPalette.actions.documentation'),
        icon: 'mdi-book-open-page-variant',
        group: 'help',
        keywords: ['docs', 'manual', 'help'],
        run: () => appShell.showDocumentation('app'),
      },
      {
        id: 'help-feedback',
        title: t('commandPalette.actions.feedback'),
        icon: 'mdi-message-text-outline',
        group: 'help',
        keywords: ['bug', 'report'],
        run: () => dialogsStore.openFeedback(),
      },
    )

    if (sessionFocusStore.tag) {
      const focusName = sessionFocusStore.tag.name
      list.push(
        {
          id: 'session-focus-open',
          title: t('commandPalette.actions.session_focus_open', {name: focusName}),
          icon: 'mdi-bullseye-arrow',
          group: 'actions',
          keywords: ['focus', 'session', 'tag', 'performer'],
          run: () => openFocusTagPage(),
        },
        {
          id: 'session-focus-with',
          title: t('commandPalette.actions.session_focus_with', {name: focusName}),
          icon: 'mdi-filter-outline',
          group: 'actions',
          keywords: ['focus', 'filter', 'tagged'],
          run: () => { void browseWithFocus() },
        },
        {
          id: 'session-focus-without',
          title: t('commandPalette.actions.session_focus_without', {name: focusName}),
          subtitle: t('commandPalette.actions.session_focus_without_hint'),
          icon: 'mdi-tag-plus-outline',
          group: 'actions',
          keywords: ['focus', 'untagged', 'tagging'],
          run: () => { void browseWithoutFocus() },
        },
        {
          id: 'session-focus-apply',
          title: t('commandPalette.actions.session_focus_apply', {name: focusName}),
          subtitle: t('commandPalette.actions.session_focus_apply_hint'),
          icon: 'mdi-tag-plus',
          group: 'actions',
          keywords: ['focus', 'apply', 'selection'],
          run: () => {
            if (itemsStore.selection.length) {
              void applyFocusTagToMediaIds([...itemsStore.selection])
            }
          },
        },
        {
          id: 'session-focus-clear',
          title: t('commandPalette.actions.session_focus_clear'),
          icon: 'mdi-close-circle-outline',
          group: 'actions',
          keywords: ['focus', 'clear', 'end'],
          run: () => clearFocus(),
        },
      )
    }

    if (nav.showPlaylists.value) {
      list.push({
        id: 'nav-playlists',
        title: t('navigation.playlists'),
        icon: 'mdi-format-list-bulleted',
        group: 'navigation',
        keywords: ['list', 'queue'],
        run: () => { void router.push('/playlists') },
      })
    }

    if (nav.showMarkers.value) {
      list.push({
        id: 'nav-markers',
        title: t('navigation.markers'),
        icon: 'mdi-tooltip-outline',
        group: 'navigation',
        keywords: ['clips', 'bookmarks'],
        run: () => { void router.push('/markers') },
      })
    }

    for (const mediaType of nav.mediaTypes.value) {
      list.push({
        id: `nav-media-${mediaType.id}`,
        title: getMediaTypeName(mediaType, t),
        subtitle: t('commandPalette.groups.navigation'),
        icon: mediaType.icon ? `mdi-${mediaType.icon}` : 'mdi-folder-outline',
        group: 'navigation',
        keywords: ['media', 'type', 'library'],
        run: () => { void router.push(nav.mediaTypePath(mediaType.id)) },
      })
    }

    for (const meta of nav.metaVisible.value) {
      list.push({
        id: `nav-meta-${meta.id}`,
        title: meta.name || String(meta.id),
        subtitle: t('navigation.section_tags'),
        icon: meta.icon ? `mdi-${meta.icon}` : 'mdi-tag-outline',
        group: 'navigation',
        keywords: ['tag', 'category', 'meta'],
        run: () => { void router.push(nav.metaPath(meta.id)) },
      })
    }

    if (LOCAL_AI_UI_ENABLED) {
      list.push({
        id: 'local-ai',
        title: t('settings_labels.local_ai.chat_title'),
        icon: 'mdi-robot-outline',
        group: 'help',
        keywords: ['ai', 'assistant', 'chat'],
        run: () => { dialogsStore.localAi.show = true },
      })
    }

    if (settingsStore.passwordProtection === '1') {
      list.push({
        id: 'lock',
        title: t('commandPalette.actions.lock'),
        icon: 'mdi-lock',
        group: 'settings',
        keywords: ['password', 'secure'],
        run: () => { appStore.isLocked = true },
      })
    }

    return list
  })

  function matchCommands(query: string, opts?: {idleOnly?: boolean}) {
    let list = filterCommandPaletteCommands(commands.value, query)
    if (opts?.idleOnly) {
      list = list.filter((command) => command.group !== 'navigation')
    }
    return list
  }

  return {
    commands,
    matchCommands,
  }
}

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/pages/PageHome.vue'),
  },
  {
    path: '/media',
    alias: '/meta',
    name: 'Items',
    component: () => import('@/pages/PageItems.vue'),
  },
  {
    path: '/playlists',
    name: 'Playlists',
    component: () => import('@/pages/PagePlaylists.vue'),
  },
  {
    path: '/folders',
    name: 'Folders',
    component: () => import('@/pages/PageFolders.vue'),
  },
  {
    path: '/markers',
    name: 'Markers',
    component: () => import('@/pages/PageMarkers.vue'),
  },
  {
    path: '/tags',
    name: 'AllTags',
    component: () => import('@/pages/PageAllTags.vue'),
  },
  {
    path: '/tag',
    name: 'Tag',
    component: () => import('@/pages/PageTag.vue'),
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/pages/PageSettings.vue'),
  },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})

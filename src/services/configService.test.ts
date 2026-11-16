import {afterEach, beforeEach, expect, it, vi} from 'vitest'

const {store, getServerConfig} = vi.hoisted(() => ({
  store: {localhost: '', dbPath: '', mediaPath: '', appVersion: '', config: {}, databases: []},
  getServerConfig: vi.fn(),
}))
vi.mock('@/stores/app', () => ({useAppStore: () => store}))
vi.mock('@/services/typedApi', () => ({typedApi: {getServerConfig}}))
vi.mock('@/utils/playerWindow', () => ({destroySeparatePlayerWindow: vi.fn()}))
vi.mock('@/utils/eventBus', () => ({default: {$emit: vi.fn()}}))
vi.mock('@/utils/thumbDisplayCache', () => ({clearThumbDisplayCache: vi.fn()}))
vi.mock('@/utils/fileExistenceBatcher', () => ({clearFileExistenceBatchQueue: vi.fn()}))
import {initConfig} from './configService'

beforeEach(() => {
  getServerConfig.mockReset()
  Object.assign(store, {localhost: '', dbPath: '', mediaPath: '', appVersion: '', config: {}, databases: []})
  vi.stubGlobal('electronAPI', undefined)
})
afterEach(() => vi.unstubAllGlobals())

it('boots from the current API rather than a static build-machine configuration', async () => {
  const config = {path: '/isolated/library', port: 12329, appVersion: '1.13.0', databases: []}
  getServerConfig.mockResolvedValue({data: config})
  expect(await initConfig()).toBe(config)
  expect(getServerConfig).toHaveBeenCalledExactlyOnceWith({baseURL: window.location.origin})
  expect(store.dbPath).toBe('/isolated/library')
  expect(store.config).toBe(config)
})

it('uses the Electron backend port even when Vite runs on another origin', async () => {
  const invoke = vi.fn().mockResolvedValue({port: 12322})
  vi.stubGlobal('electronAPI', {invoke})
  getServerConfig.mockResolvedValue({data: {path: '/electron/library', port: 12322}})
  await initConfig()
  expect(invoke).toHaveBeenCalledExactlyOnceWith('get-config')
  expect(getServerConfig).toHaveBeenCalledExactlyOnceWith({baseURL: 'http://127.0.0.1:12322'})
})

it('fails closed when bootstrap is unavailable instead of using stale static settings', async () => {
  getServerConfig.mockRejectedValue(new Error('offline'))
  await expect(initConfig()).rejects.toThrow('offline')
  expect(store.dbPath).toBe('')
})

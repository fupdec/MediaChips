export interface ServerDatabaseEntry {
  id: string
  name: string
  active: boolean
  createdAt?: number
}

export interface ServerConfig {
  port: number
  ip?: string
  ips?: string[]
  hostname?: string
  path?: string
  appVersion?: string
  registration?: string
  onboardingCompleted?: string
  onboardingStep?: string
  onboardingPaused?: string
  minimizeToTray?: string
  allowLanAccess?: string
  checkForUpdatesAtStartup?: string
  selectedDisk?: string
  transcodeUnsupportedFormats?: string
  transcodeMaxHeight?: string
  transcodeCacheMaxGb?: string
  zoom?: string
  databases: ServerDatabaseEntry[]
}

export interface RouteLoadError {
  routeFile: string
  message: string
}

export interface NetworkIpInfo {
  address: string
  interface: string
  mac: string
  netmask?: string
  cidr?: string
  isLinkLocal?: boolean
}

export interface NetworkHelpers {
  getBestLocalIp: () => string
  getAllIps: () => NetworkIpInfo[]
}

export interface ServerInitResult {
  config: ServerConfig
  configPath: string
  databasesPath: string
  app_folder?: string
  is_electron_running?: string | false
  bestIp?: string
  allIpsInfo?: NetworkIpInfo[]
}

export interface DatabaseBundle {
  sequelize: unknown
  db: Record<string, unknown> & {
    config?: ServerDatabaseEntry
    path_databases?: string
    path?: string
  }
}

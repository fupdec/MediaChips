export {
  closeDrizzleClient,
  createDrizzleClient,
  type DrizzleClient,
  type DrizzleConnection,
  type DrizzleSchema,
} from './client'
export {
  closeActiveConnection,
  getActiveConnection,
  getDrizzleProxy,
  getSqliteProxy,
  setActiveConnection,
} from './connectionHolder'
export {
  createFilterRowsInSavedFiltersRepository,
  createFilterRowsRepository,
  createFacesRepository,
  createImageMetadataRepository,
  createMarksRepository,
  createMediaInPlaylistsRepository,
  createMediaRepository,
  createMediaTypesInWatchedFoldersRepository,
  createMediaTypesRepository,
  createMetaInMediaTypesRepository,
  createMetaRepository,
  createMetaSettingsRepository,
  createPageSettingsRepository,
  createPinnedMetaRepository,
  createPlaylistsRepository,
  createSavedFiltersRepository,
  createSettingsRepository,
  createTagsInFilterRowsRepository,
  createTagsInMediaRepository,
  createFolderPathsRepository,
  createTagsInFoldersRepository,
  createTagsInTagRepository,
  createTagsRepository,
  createTabsRepository,
  createValuesInMediaRepository,
  createValuesInTagRepository,
  createVideoMetadataRepository,
  createWatchedFoldersRepository,
} from './repositories'
export {applySqlitePragmas} from './pragmas'
export {
  dropAllSqliteTables,
  ensureLegacyDrizzleBaseline,
  resetSqliteDatabase,
  runDrizzleMigrations,
} from './drizzleMigrations'
export {bootstrapDatabase, resetDatabaseAndRunMigrations} from './migrationRunner'
export {runPostMigrations} from './postMigrations'
export {seedDefaults} from './seedDefaults'
export {seedStarterMeta, seedDemoMetadata} from './seedStarterMeta'
export {runLegacyUpgrades} from './legacyUpgrades'
export {smokeTestDrizzle} from './smoke'
export {bindNamedParameters, queryAll, queryAllAsync, queryGet} from './utils/rawQuery'
export * as schema from './schema'

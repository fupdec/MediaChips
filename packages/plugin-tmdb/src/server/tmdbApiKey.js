"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTmdbApiKey = resolveTmdbApiKey;
exports.isTmdbConfigured = isTmdbConfigured;
const settings_1 = require("../../../../api/db/repositories/settings");
function resolveTmdbApiKey(db) {
    const serverConfig = globalThis.serverConfig;
    const fromConfig = typeof serverConfig?.tmdbApiKey === 'string' ? serverConfig.tmdbApiKey.trim() : '';
    if (fromConfig)
        return fromConfig;
    const fromDb = db
        ? String((0, settings_1.createSettingsRepository)(db.drizzle).findByOption('tmdbApiKey')?.value || '').trim()
        : '';
    if (fromDb)
        return fromDb;
    return String(process.env.TMDB_API_KEY || '').trim();
}
function isTmdbConfigured(db) {
    return resolveTmdbApiKey(db).length > 0;
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = registerTmdbPluginMain;
const express_1 = __importDefault(require("express"));
const validateBody_1 = require("../../../../api/middleware/validateBody");
const requests_1 = require("../../../../shared/schemas/requests");
const Tmdb_controller_1 = __importDefault(require("./Tmdb.controller"));
function registerTmdbPluginMain(app, db) {
    const controller = (0, Tmdb_controller_1.default)(db);
    const router = express_1.default.Router();
    router.get('/status', controller.status);
    router.post('/search', (0, validateBody_1.validateBody)(requests_1.TmdbSearchRequestSchema), controller.search);
    router.get('/movie/:id', controller.movie);
    router.get('/title/:mediaType/:id', controller.title);
    router.get('/find/imdb/:imdbId', controller.findImdb);
    router.post('/person/search', (0, validateBody_1.validateBody)(requests_1.TmdbSearchRequestSchema), controller.searchPeople);
    router.get('/person/:id', controller.person);
    app.use('/api/tmdb', router);
}

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
function loadLocalEnv() {
    var _a;
    var _b;
    var envPath = fileURLToPath(new URL('./.env.local', import.meta.url));
    if (!existsSync(envPath)) {
        return;
    }
    var content = readFileSync(envPath, 'utf-8');
    for (var _i = 0, _c = content.split(/\r?\n/); _i < _c.length; _i++) {
        var line = _c[_i];
        var trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            continue;
        }
        var separatorIndex = trimmed.indexOf('=');
        var key = trimmed.slice(0, separatorIndex).trim();
        var rawValue = trimmed.slice(separatorIndex + 1).trim();
        (_a = (_b = process.env)[key]) !== null && _a !== void 0 ? _a : (_b[key] = rawValue.replace(/^["']|["']$/g, ''));
    }
}
function readJsonBody(request) {
    return __awaiter(this, void 0, void 0, function () {
        var chunks, chunk, e_1_1, body;
        var _a, request_1, request_1_1;
        var _b, e_1, _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    chunks = [];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, 7, 12]);
                    _a = true, request_1 = __asyncValues(request);
                    _e.label = 2;
                case 2: return [4 /*yield*/, request_1.next()];
                case 3:
                    if (!(request_1_1 = _e.sent(), _b = request_1_1.done, !_b)) return [3 /*break*/, 5];
                    _d = request_1_1.value;
                    _a = false;
                    chunk = _d;
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                    _e.label = 4;
                case 4:
                    _a = true;
                    return [3 /*break*/, 2];
                case 5: return [3 /*break*/, 12];
                case 6:
                    e_1_1 = _e.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 12];
                case 7:
                    _e.trys.push([7, , 10, 11]);
                    if (!(!_a && !_b && (_c = request_1.return))) return [3 /*break*/, 9];
                    return [4 /*yield*/, _c.call(request_1)];
                case 8:
                    _e.sent();
                    _e.label = 9;
                case 9: return [3 /*break*/, 11];
                case 10:
                    if (e_1) throw e_1.error;
                    return [7 /*endfinally*/];
                case 11: return [7 /*endfinally*/];
                case 12:
                    body = Buffer.concat(chunks).toString('utf-8').trim();
                    if (!body) {
                        return [2 /*return*/, {}];
                    }
                    return [2 /*return*/, JSON.parse(body)];
            }
        });
    });
}
function sourceSyncPlugin() {
    return {
        name: 'source-sync-api',
        configureServer: function (server) {
            var routes = [
                {
                    fallbackMessage: 'Fonte de armazenamento sincronizada.',
                    route: '/api/sync-storage',
                    scriptPath: fileURLToPath(new URL('./scripts/sync-storage-source.mjs', import.meta.url)),
                },
                {
                    fallbackMessage: 'Fonte de chamados sincronizada.',
                    route: '/api/sync-tickets',
                    scriptPath: fileURLToPath(new URL('./scripts/sync-tickets-source.mjs', import.meta.url)),
                },
                {
                    fallbackMessage: 'Fonte de usuários PW atualizada.',
                    route: '/api/sync-pw-users',
                    scriptPath: fileURLToPath(new URL('./scripts/export-pw-users-to-xlsx.mjs', import.meta.url)),
                },
                {
                    fallbackMessage: 'Fonte de usuários do Portal Bentley atualizada.',
                    route: '/api/sync-portal-users',
                    scriptPath: fileURLToPath(new URL('./scripts/sync-portal-users-source.mjs', import.meta.url)),
                },
            ];
            var _loop_1 = function (config) {
                var route = config.route;
                server.middlewares.use(route, function (request, response) {
                    if (request.method !== 'POST') {
                        response.statusCode = 405;
                        response.setHeader('Content-Type', 'application/json');
                        response.end(JSON.stringify({ error: 'Método não permitido.' }));
                        return;
                    }
                    execFile(process.execPath, [config.scriptPath], function (error, stdout, stderr) {
                        response.setHeader('Content-Type', 'application/json');
                        if (error) {
                            response.statusCode = 500;
                            response.end(JSON.stringify({
                                error: stderr.trim() || stdout.trim() || error.message,
                            }));
                            return;
                        }
                        response.statusCode = 200;
                        var output = stdout.trim();
                        var sync;
                        try {
                            sync = output ? JSON.parse(output) : null;
                        }
                        catch (_a) {
                            sync = null;
                        }
                        response.end(JSON.stringify({
                            message: sync
                                ? config.fallbackMessage
                                : output || config.fallbackMessage,
                            sync: sync,
                        }));
                    });
                });
            };
            for (var _i = 0, routes_1 = routes; _i < routes_1.length; _i++) {
                var config = routes_1[_i];
                _loop_1(config);
            }
        },
    };
}
function localAdminUsersApiPlugin() {
    return {
        name: 'local-admin-users-api',
        configureServer: function (server) {
            var _this = this;
            loadLocalEnv();
            server.middlewares.use('/api/admin-users', function (request, response) { return __awaiter(_this, void 0, void 0, function () {
                var handleAdminUsersRequest, result, _a, _b, error_1;
                var _c;
                var _d;
                return __generator(this, function (_e) {
                    switch (_e.label) {
                        case 0:
                            _e.trys.push([0, 6, , 7]);
                            return [4 /*yield*/, import('./api/admin-users.mjs')];
                        case 1:
                            handleAdminUsersRequest = (_e.sent()).handleAdminUsersRequest;
                            _a = handleAdminUsersRequest;
                            _c = {};
                            if (!(request.method === 'GET')) return [3 /*break*/, 2];
                            _b = {};
                            return [3 /*break*/, 4];
                        case 2: return [4 /*yield*/, readJsonBody(request)];
                        case 3:
                            _b = _e.sent();
                            _e.label = 4;
                        case 4: return [4 /*yield*/, _a.apply(void 0, [(_c.body = _b,
                                    _c.headers = request.headers,
                                    _c.method = (_d = request.method) !== null && _d !== void 0 ? _d : 'GET',
                                    _c)])];
                        case 5:
                            result = _e.sent();
                            response.statusCode = result.status;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
                            return [3 /*break*/, 7];
                        case 6:
                            error_1 = _e.sent();
                            response.statusCode = 500;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify({
                                error: error_1 instanceof Error ? error_1.message : 'Erro inesperado.',
                            }));
                            return [3 /*break*/, 7];
                        case 7: return [2 /*return*/];
                    }
                });
            }); });
            server.middlewares.use('/api/storage-import', function (request, response) { return __awaiter(_this, void 0, void 0, function () {
                var handleStorageImportRequest, result, _a, error_2;
                var _b;
                var _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, import('./api/storage-import.mjs')];
                        case 1:
                            handleStorageImportRequest = (_d.sent()).handleStorageImportRequest;
                            _a = handleStorageImportRequest;
                            _b = {};
                            return [4 /*yield*/, readJsonBody(request)];
                        case 2: return [4 /*yield*/, _a.apply(void 0, [(_b.body = _d.sent(),
                                    _b.headers = request.headers,
                                    _b.method = (_c = request.method) !== null && _c !== void 0 ? _c : 'POST',
                                    _b)])];
                        case 3:
                            result = _d.sent();
                            response.statusCode = result.status;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
                            return [3 /*break*/, 5];
                        case 4:
                            error_2 = _d.sent();
                            response.statusCode = 500;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify({
                                error: error_2 instanceof Error ? error_2.message : 'Erro inesperado.',
                            }));
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
            server.middlewares.use('/api/pw-users-import', function (request, response) { return __awaiter(_this, void 0, void 0, function () {
                var handleProjectWiseUsersImportRequest, result, _a, error_3;
                var _b;
                var _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, import('./api/pw-users-import.mjs')];
                        case 1:
                            handleProjectWiseUsersImportRequest = (_d.sent()).handleProjectWiseUsersImportRequest;
                            _a = handleProjectWiseUsersImportRequest;
                            _b = {};
                            return [4 /*yield*/, readJsonBody(request)];
                        case 2: return [4 /*yield*/, _a.apply(void 0, [(_b.body = _d.sent(),
                                    _b.headers = request.headers,
                                    _b.method = (_c = request.method) !== null && _c !== void 0 ? _c : 'POST',
                                    _b)])];
                        case 3:
                            result = _d.sent();
                            response.statusCode = result.status;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
                            return [3 /*break*/, 5];
                        case 4:
                            error_3 = _d.sent();
                            response.statusCode = 500;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify({
                                error: error_3 instanceof Error ? error_3.message : 'Erro inesperado.',
                            }));
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
            server.middlewares.use('/api/tickets', function (request, response) { return __awaiter(_this, void 0, void 0, function () {
                var handleTicketsRequest, result, _a, error_4;
                var _b;
                var _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 4, , 5]);
                            return [4 /*yield*/, import('./api/tickets.mjs')];
                        case 1:
                            handleTicketsRequest = (_d.sent()).handleTicketsRequest;
                            _a = handleTicketsRequest;
                            _b = {};
                            return [4 /*yield*/, readJsonBody(request)];
                        case 2: return [4 /*yield*/, _a.apply(void 0, [(_b.body = _d.sent(),
                                    _b.headers = request.headers,
                                    _b.method = (_c = request.method) !== null && _c !== void 0 ? _c : 'POST',
                                    _b)])];
                        case 3:
                            result = _d.sent();
                            response.statusCode = result.status;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify(result.error ? { error: result.error } : result.body));
                            return [3 /*break*/, 5];
                        case 4:
                            error_4 = _d.sent();
                            response.statusCode = 500;
                            response.setHeader('Content-Type', 'application/json');
                            response.end(JSON.stringify({
                                error: error_4 instanceof Error ? error_4.message : 'Erro inesperado.',
                            }));
                            return [3 /*break*/, 5];
                        case 5: return [2 /*return*/];
                    }
                });
            }); });
        },
    };
}
export default defineConfig({
    plugins: [react(), sourceSyncPlugin(), localAdminUsersApiPlugin()],
    server: {
        proxy: {
            '/api': 'http://127.0.0.1:8080',
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
});

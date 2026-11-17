import express, { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { clientIpKeyGenerator } from './rate-limit-ip.mjs';

// Content Security Policy do painel.
// Começa em modo relatório (Content-Security-Policy-Report-Only): o navegador
// não bloqueia nada, só envia as violações para /api/csp-report, que ficam no
// log do App Service. Depois de alguns dias sem violações legítimas, ative o
// bloqueio com CSP_ENFORCE=true nas App Settings (sem novo deploy de código).
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  // React e Leaflet usam atributos style inline; fontes do Google Fonts.
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  // Tiles do mapa (OpenStreetMap/Esri) e fotos dos apontamentos, servidas
  // pelo armazenamento do Kartado em hosts variados.
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  connectSrc: ["'self'"],
  frameSrc: ['https://www.openstreetmap.org'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  reportUri: ['/api/csp-report'],
};

export function contentSecurityPolicy(env = process.env) {
  return {
    useDefaults: false,
    reportOnly: env.CSP_ENFORCE !== 'true',
    directives: CSP_DIRECTIVES,
  };
}

const REPORT_TYPES = ['application/csp-report', 'application/reports+json', 'application/json'];

// Reduz um relatório ao essencial, sem query strings (podem conter dados).
function summarize(report) {
  const body = report?.['csp-report'] ?? report?.body ?? report ?? {};
  const strip = (value) => {
    if (typeof value !== 'string' || !value) return value ?? null;
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.slice(0, 200);
    }
  };
  return {
    directive: body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive'] ?? null,
    blocked: strip(body['blocked-uri'] ?? body.blockedURL),
    page: strip(body['document-uri'] ?? body.documentURL),
    source: strip(body['source-file'] ?? body.sourceFile),
    line: body['line-number'] ?? body.lineNumber ?? null,
  };
}

export function createCspReportRouter({ log = console.warn } = {}) {
  const router = Router();
  router.use(rateLimit({ windowMs: 60_000, limit: 30, keyGenerator: clientIpKeyGenerator, standardHeaders: 'draft-7', legacyHeaders: false }));
  router.post('/', express.json({ type: REPORT_TYPES, limit: '16kb' }), (request, response) => {
    const reports = Array.isArray(request.body) ? request.body.slice(0, 10) : [request.body];
    for (const report of reports) log('[CSP] violação', summarize(report));
    response.status(204).end();
  });
  return router;
}

export const cspReportRouter = createCspReportRouter();

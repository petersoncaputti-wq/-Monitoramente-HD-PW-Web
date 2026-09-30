import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { createSession, setSessionCookie } from '../auth.mjs';
import { createSamlClient, createSamlRepository, samlConfig, samlHash, verifiedEntraIdentity, validateResponseDestination } from '../services/saml.service.mjs';

const FLOW_COOKIE = '__Host-monitoramento_saml';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };
const opaque = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function flowCookie(request) {
  const prefix = `${FLOW_COOKIE}=`;
  const values = (request.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(prefix));
  return values.length === 1 ? values[0].slice(prefix.length) : '';
}

export function createSamlRouter({ configuration = samlConfig, repository = createSamlRepository(), makeClient = createSamlClient, issueSession = createSession, sessionCookie = setSessionCookie, throttle } = {}) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  router.get('/config', (_req, res) => {
    try { res.json({ enabled: Boolean(configuration()), provider: 'Microsoft Entra ID' }); }
    catch { res.json({ enabled: false, provider: 'Microsoft Entra ID', unavailable: true }); }
  });
  router.use((req, res, next) => {
    try {
      req.samlConfig = configuration();
      if (!req.samlConfig) return res.status(404).json({ error: 'Login corporativo não habilitado.' });
      next();
    } catch { res.status(503).json({ error: 'A configuração do login corporativo precisa ser revisada pelo administrador.' }); }
  });
  const limiter = throttle || rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Muitas tentativas de login corporativo. Aguarde alguns minutos.' } });
  router.get('/metadata', (_req, res) => {
    const config = _req.samlConfig;
    const client = makeClient(config, repository.cache('metadata'));
    res.type('application/samlmetadata+xml').send(client.generateServiceProviderMetadata(null, config.publicCert || null));
  });
  router.get('/login', limiter, async (req, res) => {
    const state = randomBytes(32).toString('hex');
    const browser = randomBytes(32).toString('hex');
    await repository.createFlow(state, browser);
    const client = makeClient(req.samlConfig, repository.cache(samlHash(state)));
    const destination = await client.getAuthorizeUrlAsync(state, undefined, {});
    res.cookie(FLOW_COOKIE, browser, { ...cookieOptions, maxAge: 10 * 60_000 });
    res.redirect(302, destination);
  });
  router.post('/acs', limiter, express.urlencoded({ extended: false, limit: '256kb', parameterLimit: 5 }), async (req, res) => {
    const state = req.body?.RelayState;
    const browser = flowCookie(req);
    res.clearCookie(FLOW_COOKIE, cookieOptions);
    try {
      if (!opaque(state) || !opaque(browser) || typeof req.body?.SAMLResponse !== 'string'
        || req.body.SAMLResponse.length > 256 * 1024) throw new Error('Invalid flow');
      // Consumo atômico, antes da validação, impede respostas concorrentes e login CSRF.
      const flow = await repository.consumeFlow(state, browser);
      if (!flow) throw new Error('Expired flow');
      validateResponseDestination(req.body.SAMLResponse, req.samlConfig);
      const client = makeClient(req.samlConfig, repository.cache(flow));
      const { profile, loggedOut } = await client.validatePostResponseAsync({ SAMLResponse: req.body.SAMLResponse });
      if (loggedOut) throw new Error('Unexpected logout');
      const identity = verifiedEntraIdentity(profile, req.samlConfig);
      const user = await repository.findUser(identity.tenant, identity.objectId);
      if (!user) return res.redirect(303, '/?saml_error=access_denied');
      const token = await issueSession(user.id, { expiresAt: identity.expiresAt });
      sessionCookie(res, token);
      res.redirect(303, '/');
    } catch {
      // Nunca registra o XML, claims, cookies ou mensagens do IdP em logs/respostas.
      res.redirect(303, '/?saml_error=login_failed');
    }
  });
  router.use((_error, _req, res, _next) => {
    res.status(503).json({ error: 'Login corporativo indisponível. Tente novamente ou utilize o acesso local autorizado.' });
  });
  return router;
}
export default createSamlRouter();

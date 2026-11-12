import { createHash, X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import { SAML } from '@node-saml/node-saml';
import { DOMParser } from '@xmldom/xmldom';
import { query } from '../db.mjs';

export const samlHash = value => createHash('sha256').update(value).digest('hex');
export const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export class SamlAccessError extends Error {}
// Esta leitura apenas rejeita destinos incorretos; a identidade exige as assinaturas abaixo.
export function validateResponseDestination(encoded, config) {
  const xml = Buffer.from(encoded, 'base64').toString('utf8');
  const reject = () => { throw new SamlAccessError('Resposta SAML inválida.'); };
  if (/<!DOCTYPE/i.test(xml)) reject();
  const document = new DOMParser({ errorHandler: { warning: reject, error: reject, fatalError: reject } }).parseFromString(xml, 'text/xml');
  const root = document.documentElement;
  if (root?.localName !== 'Response' || root.namespaceURI !== 'urn:oasis:names:tc:SAML:2.0:protocol'
    || root.getAttribute('Destination') !== config.callbackUrl) reject();
}
const pem = value => String(value || '').replace(/\\n/g, '\n').trim();

export function samlConfig(env = process.env) {
  if (env.SAML_ENABLED !== 'true') return null;
  const tenant = env.SAML_ENTRA_TENANT_ID?.trim().toLowerCase();
  if (!isUuid(tenant)) throw new Error('SAML_ENTRA_TENANT_ID inválido.');
  let origin;
  try { origin = new URL(env.SAML_PUBLIC_ORIGIN); } catch { throw new Error('SAML_PUBLIC_ORIGIN inválido.'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('SAML_PUBLIC_ORIGIN deve ser uma origem HTTPS, sem caminho.');
  const certificates = pem(env.SAML_IDP_CERT).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!certificates?.length) throw new Error('Configure SAML_IDP_CERT com o certificado de assinatura do Entra.');
  const now = Date.now();
  const activeCertificates = certificates.filter(value => {
    const certificate = new X509Certificate(value);
    return Date.parse(certificate.validFrom) <= now && Date.parse(certificate.validTo) > now;
  });
  if (!activeCertificates.length) throw new Error('Nenhum certificado SAML vigente.');
  const privateKey = pem(env.SAML_SP_PRIVATE_KEY) || undefined;
  const publicCert = pem(env.SAML_SP_CERT) || undefined;
  if (Boolean(privateKey) !== Boolean(publicCert)) throw new Error('Configure a chave e o certificado SP juntos.');
  if (privateKey) {
    const certificate = new X509Certificate(publicCert);
    if (!certificate.publicKey.equals(createPublicKey(createPrivateKey(privateKey))) || Date.parse(certificate.validTo) <= now || Date.parse(certificate.validFrom) > now) throw new Error('Certificado SP inválido ou incompatível com a chave.');
  }
  return {
    tenant, origin: origin.origin,
    issuer: env.SAML_SP_ENTITY_ID?.trim() || `${origin.origin}/api/auth/saml/metadata`,
    idpIssuer: `https://sts.windows.net/${tenant}/`,
    entryPoint: `https://login.microsoftonline.com/${tenant}/saml2`,
    callbackUrl: `${origin.origin}/api/auth/saml/acs`,
    idpCert: activeCertificates, privateKey, publicCert,
  };
}

export function createSamlRepository(execute = query) {
  return {
    async createFlow(state, browser) {
      await execute('delete from app_saml_flows where expires_at<=now()');
      await execute('delete from app_saml_requests where expires_at<=now()');
      await execute('insert into app_saml_flows(state_hash,browser_hash) values ($1,$2)', [samlHash(state), samlHash(browser)]);
    },
    async consumeFlow(state, browser) {
      const result = await execute(`delete from app_saml_flows where state_hash=$1 and browser_hash=$2 and expires_at>now() returning state_hash`, [samlHash(state), samlHash(browser)]);
      return result.rows[0]?.state_hash || null;
    },
    cache(flowHash) {
      return {
        async saveAsync(key, value) {
          const result = await execute(`insert into app_saml_requests(id,flow_hash,value) values ($1,$2,$3) returning value,created_at`, [key, flowHash, value]);
          return { value: result.rows[0].value, createdAt: new Date(result.rows[0].created_at).getTime() };
        },
        async getAsync(key) {
          const result = await execute('select value from app_saml_requests where id=$1 and flow_hash=$2 and expires_at>now()', [key, flowHash]);
          return result.rows[0]?.value || null;
        },
        async removeAsync(key) {
          const result = await execute('delete from app_saml_requests where id=$1 and flow_hash=$2 returning id', [key, flowHash]);
          return result.rows[0]?.id || null;
        },
      };
    },
    async findUser(tenant, objectId) {
      const result = await execute(`select u.id,u.role from app_saml_identities i join app_users u on u.id=i.user_id
        where i.tenant_id=$1 and i.object_id=$2 and u.is_active=true`, [tenant, objectId]);
      return result.rows[0] || null;
    },
  };
}
export function createSamlClient(config, cacheProvider) {
  return new SAML({
    ...config, audience: config.issuer, cacheProvider,
    validateInResponseTo: 'always', requestIdExpirationPeriodMs: 10 * 60_000,
    wantAssertionsSigned: true, wantAuthnResponseSigned: true,
    acceptedClockSkewMs: 60_000, maxAssertionAgeMs: 5 * 60_000,
    disableRequestedAuthnContext: true, identifierFormat: null,
    signatureAlgorithm: 'sha256', digestAlgorithm: 'sha256',
  });
}

// Lê somente a asserção cuja assinatura foi validada pelo Node-SAML.
export function verifiedEntraIdentity(profile, config, now = Date.now()) {
  if (!profile || profile.issuer !== config.idpIssuer || typeof profile.inResponseTo !== 'string') throw new SamlAccessError('Emissor SAML inválido.');
  const tenant = profile['http://schemas.microsoft.com/identity/claims/tenantid'];
  const objectId = profile['http://schemas.microsoft.com/identity/claims/objectidentifier'];
  if (!isUuid(tenant) || tenant.toLowerCase() !== config.tenant || !isUuid(objectId)) throw new SamlAccessError('Identidade corporativa inválida.');
  const assertion = profile.getAssertion?.()?.Assertion;
  const subjects = assertion?.Subject;
  const confirmations = subjects?.[0]?.SubjectConfirmation;
  const confirmation = confirmations?.[0];
  const data = confirmation?.SubjectConfirmationData?.[0]?.$;
  const conditions = assertion?.Conditions?.[0]?.$;
  const issue = Date.parse(assertion?.$?.IssueInstant);
  const end = Date.parse(data?.NotOnOrAfter);
  const conditionsEnd = Date.parse(conditions?.NotOnOrAfter);
  const validOptionalTime = value => value === undefined || Number.isFinite(Date.parse(value));
  if (subjects?.length !== 1 || confirmations?.length !== 1
    || assertion?.AuthnStatement?.length !== 1
    || confirmation?.$?.Method !== 'urn:oasis:names:tc:SAML:2.0:cm:bearer'
    || data?.Recipient !== config.callbackUrl || data?.InResponseTo !== profile.inResponseTo
    || !Number.isFinite(issue) || issue > now + 60_000 || now - issue > 6 * 60_000
    || !Number.isFinite(end) || end <= now - 60_000
    || !Number.isFinite(conditionsEnd) || conditionsEnd <= now - 60_000) throw new SamlAccessError('Asserção SAML inválida.');
  if (!validOptionalTime(data.NotBefore) || !validOptionalTime(conditions.NotBefore)) throw new SamlAccessError('Datas SAML inválidas.');
  const sessionEnd = assertion?.AuthnStatement?.[0]?.$?.SessionNotOnOrAfter;
  const expiresAt = Math.min(now + 8 * 60 * 60_000, sessionEnd ? Date.parse(sessionEnd) : Infinity);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new SamlAccessError('Sessão corporativa expirada.');
  return { tenant: tenant.toLowerCase(), objectId: objectId.toLowerCase(), expiresAt };
}

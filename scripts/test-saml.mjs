import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { PGlite } from '@electric-sql/pglite';
import { SignedXml } from 'xml-crypto';
import { samlConfig, createSamlRepository, createSamlClient, samlHash } from '../server/services/saml.service.mjs';
import { createSamlRouter } from '../server/routes/saml.mjs';

// Certificados efêmeros exclusivamente para testes; nenhuma credencial real é necessária.
const directory = mkdtempSync(join(tmpdir(), 'monitoramento-saml-test-'));
const openssl = process.platform === 'win32' && existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
function certificate(name) {
  const keyPath = join(directory, name + '.key');
  const certPath = join(directory, name + '.pem');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', `/CN=${name}`], { stdio: 'ignore' });
  return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
}
let server;
let db;
try {
  const idp = certificate('test-idp');
  const other = certificate('untrusted-idp');
  const tenant = '00000000-0000-4000-8000-000000000001';
  const objectId = '00000000-0000-4000-8000-000000000002';
  const userId = '00000000-0000-4000-8000-000000000003';
  const env = { SAML_ENABLED: 'true', SAML_PUBLIC_ORIGIN: 'https://panel.example.test', SAML_ENTRA_TENANT_ID: tenant, SAML_IDP_CERT: idp.cert };
  const config = samlConfig(env);
  assert.equal(samlConfig({}), null);
  assert.throws(() => samlConfig({ ...env, SAML_PUBLIC_ORIGIN: 'http://panel.example.test' }));
  assert.throws(() => samlConfig({ ...env, SAML_IDP_CERT: 'invalid' }));
  assert.throws(() => samlConfig({ ...env, SAML_ENTRA_TENANT_ID: 'common' }));
  assert.throws(() => samlConfig({ ...env, SAML_SP_PRIVATE_KEY: idp.key, SAML_SP_CERT: other.cert }));
  assert.equal(samlConfig({ ...env, SAML_IDP_CERT: idp.cert + '\n' + other.cert }).idpCert.length, 2);
  db = new PGlite();
  await db.exec('create table app_users(id uuid primary key, role text not null, is_active boolean not null)');
  const schema = readFileSync(new URL('../azure/saml-schema.sql', import.meta.url), 'utf8');
  await db.exec(schema); await db.exec(schema);
  await db.query("insert into app_users values ($1,'user',true)", [userId]);
  await db.query('insert into app_saml_identities(tenant_id,object_id,user_id) values ($1,$2,$3)', [tenant, objectId, userId]);
  const repository = createSamlRepository((sql, values) => db.query(sql, values));
  let issued = [];
  const app = express();
  app.use('/saml', createSamlRouter({ configuration: () => config, repository,
    throttle: (_req, _res, next) => next(),
    issueSession: async (id, options) => { issued.push({ id, options }); return 'test-session'; },
  }));
  app.use('/disabled', createSamlRouter({ configuration: () => null }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function start() {
    const response = await fetch(base + '/saml/login', { redirect: 'manual' });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get('Location'));
    assert.equal(location.origin, 'https://login.microsoftonline.com');
    assert.equal(location.pathname, `/${tenant}/saml2`);
    const cookies = response.headers.get('Set-Cookie');
    assert.match(cookies, /HttpOnly/); assert.match(cookies, /Secure/); assert.match(cookies, /SameSite=None/);
    const xml = inflateRawSync(Buffer.from(location.searchParams.get('SAMLRequest'), 'base64')).toString();
    const requestId = xml.match(/\bID="([^"]+)"/)[1];
    return { requestId, relay: location.searchParams.get('RelayState'), cookie: cookies.split(';')[0] };
  }
  function sign(xml, tag, signingKey = idp.key) {
    const signature = new SignedXml({ privateKey: signingKey,
      signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
      canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' });
    signature.addReference({ xpath: `//*[local-name()='${tag}']`, transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'], digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256' });
    signature.computeSignature(xml, { location: { reference: `//*[local-name()='${tag}']/*[local-name()='Issuer']`, action: 'after' } });
    return signature.getSignedXml();
  }
  function responseFor(flow, options = {}) {
    const issue = new Date(Date.now() - (options.expired ? 3600_000 : 10_000)).toISOString();
    const before = new Date(Date.now() - 60_000).toISOString();
    const end = new Date(Date.now() + (options.expired ? -1800_000 : 240_000)).toISOString();
    const sessionEnd = new Date(Date.now() + 3600_000).toISOString();
    const requestId = options.requestId || flow.requestId;
    const issuer = options.issuer || config.idpIssuer;
    let xml = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomUUID()}" Version="2.0" IssueInstant="${issue}" Destination="${options.destination || config.callbackUrl}" InResponseTo="${requestId}">
      <saml:Issuer>${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>
      <saml:Assertion ID="_${randomUUID()}" Version="2.0" IssueInstant="${issue}"><saml:Issuer>${issuer}</saml:Issuer>
      <saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">subject</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData InResponseTo="${requestId}" Recipient="${options.recipient || config.callbackUrl}" NotOnOrAfter="${end}"/></saml:SubjectConfirmation></saml:Subject>
      <saml:Conditions NotBefore="${before}" NotOnOrAfter="${end}"><saml:AudienceRestriction><saml:Audience>${options.audience || config.issuer}</saml:Audience></saml:AudienceRestriction></saml:Conditions>
      <saml:AuthnStatement AuthnInstant="${issue}" SessionIndex="session" SessionNotOnOrAfter="${sessionEnd}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement>
      <saml:AttributeStatement><saml:Attribute Name="http://schemas.microsoft.com/identity/claims/tenantid"><saml:AttributeValue>${options.tenant || tenant}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="http://schemas.microsoft.com/identity/claims/objectidentifier"><saml:AttributeValue>${options.objectId || objectId}</saml:AttributeValue></saml:Attribute><saml:Attribute Name="role"><saml:AttributeValue>admin</saml:AttributeValue></saml:Attribute></saml:AttributeStatement>
      </saml:Assertion></samlp:Response>`;
    if (!options.unsignedAssertion) xml = sign(xml, 'Assertion', options.key);
    if (!options.unsignedResponse) xml = sign(xml, 'Response', options.key);
    if (options.tamper) xml = xml.replace('>subject<', '>tampered<');
    return Buffer.from(xml).toString('base64');
  }
  async function post(flow, xml, cookie = flow.cookie, relay = flow.relay) {
    return fetch(base + '/saml/acs', { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ SAMLResponse: xml, RelayState: relay }) });
  }
  assert.equal((await (await fetch(base + '/disabled/config')).json()).enabled, false);
  assert.equal((await fetch(base + '/disabled/login')).status, 404);
  const metadata = await (await fetch(base + '/saml/metadata')).text();
  assert.ok(metadata.includes(config.callbackUrl)); assert.ok(metadata.includes('WantAssertionsSigned="true"')); assert.ok(!metadata.includes('PRIVATE KEY'));
  const flow = await start(); const signed = responseFor(flow);
  const success = await post(flow, signed);
  assert.equal(success.headers.get('Location'), '/');
  assert.match(success.headers.get('Set-Cookie'), /monitoramento_session=test-session/);
  assert.equal(issued.length, 1); assert.equal(issued[0].id, userId);
  assert.ok(issued[0].options.expiresAt <= Date.now() + 3600_000);
  assert.equal((await repository.findUser(tenant, objectId)).role, 'user'); // claim admin ignorada.
  assert.equal((await post(flow, signed)).headers.get('Location'), '/?saml_error=login_failed');
  assert.equal(issued.length, 1);

  for (const options of [{ destination: 'https://evil.test/acs' }, { audience: 'wrong' }, { issuer: 'https://sts.windows.net/wrong/' }, { tenant: userId }, { recipient: 'https://evil.test/acs' }, { expired: true }, { requestId: '_unknown' }, { key: other.key }, { tamper: true }, { unsignedAssertion: true }, { unsignedResponse: true }]) {
    const next = await start();
    const response = await post(next, responseFor(next, options));
    assert.equal(response.headers.get('Location'), '/?saml_error=login_failed', JSON.stringify(options));
    assert.equal(issued.length, 1);
  }
  const noCookie = await start();
  assert.equal((await post(noCookie, responseFor(noCookie), '')).headers.get('Location'), '/?saml_error=login_failed');
  const wrongState = await start();
  assert.equal((await post(wrongState, responseFor(wrongState), wrongState.cookie, 'a'.repeat(64))).headers.get('Location'), '/?saml_error=login_failed');
  const noMapping = await start();
  assert.equal((await post(noMapping, responseFor(noMapping, { objectId: userId }))).headers.get('Location'), '/?saml_error=access_denied');
  await db.query('update app_users set is_active=false where id=$1', [userId]);
  const inactive = await start();
  assert.equal((await post(inactive, responseFor(inactive))).headers.get('Location'), '/?saml_error=access_denied');
  await db.query('update app_users set is_active=true where id=$1', [userId]);
  const race = await start(); const raceResponse = responseFor(race);
  const outcomes = await Promise.all([post(race, raceResponse), post(race, raceResponse)]);
  assert.equal(outcomes.filter(result => result.headers.get('Location') === '/').length, 1);
  assert.equal(issued.length, 2);
  const cross = await start();
  const wrongFlowClient = createSamlClient(config, repository.cache(samlHash('unrelated-flow')));
  await assert.rejects(wrongFlowClient.validatePostResponseAsync({ SAMLResponse: responseFor(cross) }));
  await db.query("update app_saml_flows set expires_at=now()-interval '1 second' where state_hash=$1", [samlHash(cross.relay)]);
  assert.equal((await post(cross, responseFor(cross))).headers.get('Location'), '/?saml_error=login_failed');
  console.log('SAML: assinaturas reais, certificado, audiência, emissor/tenant, destinatário, expiração, correlação, vínculo, usuário inativo, privilégio, replay concorrente e migração: OK.');
} finally {
  server?.closeAllConnections(); server?.close();
  await db?.close();
  const path = resolve(directory); const rel = relative(resolve(tmpdir()), path);
  if (!rel.startsWith('..') && !isAbsolute(rel) && rel.startsWith('monitoramento-saml-test-')) rmSync(path, { recursive: true, force: true });
}

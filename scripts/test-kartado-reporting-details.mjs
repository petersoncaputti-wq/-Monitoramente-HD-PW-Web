import assert from 'node:assert/strict';
import express from 'express';
import { apiFetchBasic } from '../server/services/kartado.service.mjs';
import { createReportingDetailClient, formRows } from '../server/services/kartado-reporting-detail.service.mjs';
import { createReportingDetailRouter } from '../server/routes/kartado-reporting-details.mjs';

const company = '882c7a1a-bfb2-4766-9993-90eeead59662';
const uuid = '00014854-55d0-41ca-873d-09c76b6613b3';
const other = '00014854-55d0-41ca-873d-09c76b6613b4';
const relation = id => ({ data: { id } });
const record = { id: uuid, attributes: { number: 'TEST-01', formData: { ativo: '24', dano: false, quantidade: 0, observacao: '<script>teste</script>' }, formMetadata: { ativo: { manuallySpecified: true } }, direction: '1', lane: '9', km: 0, point: { type: 'Point', coordinates: [-41, -17] } }, relationships: { company: relation(company), occurrenceType: relation('type'), status: relation('status'), firm: relation('team') } };
const resource = (id, attributes) => ({ id, attributes });
const fixture = {
  Reporting: record,
  Company: resource(company, { name: 'Unidade teste', customOptions: { reporting: { fields: { direction: { selectOptions: { options: [{ value: '1', name: 'Sul' }] } }, lane: { selectOptions: { options: [{ value: '9', name: 'Acostamento' }] } } } } } }),
  OccurrenceType: resource('type', { name: 'Monitoração', formFields: { fields: [{ apiName: 'ativo', displayName: 'Tipo de ativo', dataType: 'select', selectOptions: { options: [{ value: '24', name: 'Sinalização Vertical' }] } }] } }),
  ServiceOrderActionStatus: resource('status', { name: 'Executado' }),
  Firm: resource('team', { name: 'Equipe teste' }),
};
const paths = [];
const read = async (path, params) => {
  paths.push({ path, params });
  assert.equal(params.company, company); assert.equal(params.page, '1');
  const item = fixture[path.split('/')[1]];
  return { data: item ? [item] : [], meta: { pagination: { count: item ? 1 : 0 } } };
};
const client = createReportingDetailClient({ read });
const detail = await client.get(company, uuid);
assert.equal(detail.status, 'Executado'); assert.equal(detail.equipe, 'Equipe teste');
assert.equal(detail.localizacao.km, 0); assert.equal(detail.localizacao.sentido, 'Sul'); assert.equal(detail.localizacao.faixa, 'Acostamento');
assert.equal(detail.campos.find(f => f.key === 'ativo').value, 'Sinalização Vertical');
assert.equal(detail.campos.find(f => f.key === 'ativo').manual, true);
assert.equal(detail.campos.find(f => f.key === 'dano').value, 'Não');
assert.equal(detail.campos.find(f => f.key === 'quantidade').value, '0');
assert.equal(detail.campos.find(f => f.key === 'observacao').value, '<script>teste</script>');
assert.ok(paths.every(call => !call.path.includes(uuid) && !('include' in call.params)));
assert.equal(formRows({ empty: '', missing: null }).length, 0);
assert.equal(formRows({ multi: ['1', '2'] }, { fields: [{ apiName: 'multi', selectOptions: { options: [{ value: '1', name: 'Um' }, { value: '2', name: 'Dois' }] } }] })[0].value, 'Um; Dois');

for (const invalid of ['', '../secret', [company]]) await assert.rejects(client.get(invalid, uuid), e => e.status === 400);
await assert.rejects(createReportingDetailClient({ read: async () => ({ data: [{ ...record, id: other }] }) }).get(company, uuid));
await assert.rejects(createReportingDetailClient({ read: async () => ({ data: [{ ...record, relationships: { company: relation(other) } }] }) }).get(company, uuid), e => e.status === 404);
await assert.rejects(createReportingDetailClient({ read: async () => { throw { httpStatus: 403, message: 'private' }; } }).get(company, uuid), e => e.status === 403 && !e.message.includes('private'));
const partial = await createReportingDetailClient({ read: async (path, params) => { if (path === '/Firm/') throw new Error('private'); return read(path, params); } }).get(company, uuid);
assert.equal(partial.equipe, null); assert.ok(partial.avisos.some(w => w.includes('equipe')));

const file = { id: other, attributes: { upload: 'https://files.example.test/photo.jpg', uploadExt: 'IMAGE', kind: 'antes' }, relationships: { reporting: relation(uuid) } };
const filesClient = data => createReportingDetailClient({ read: async path => path === '/Reporting/' ? { data: [record] } : { data, meta: { pagination: { count: data.length } } } });
const files = await filesClient([file]).files(company, uuid);
assert.equal(files.arquivos[0].imagem, true); assert.ok(files.arquivos[0].url.startsWith('https:'));
assert.equal((await filesClient([{ ...file, attributes: { upload: 'javascript:alert(1)' } }]).files(company, uuid)).arquivos[0].url, null);
await assert.rejects(filesClient([{ ...file, relationships: { reporting: relation(other) } }]).files(company, uuid));
await assert.rejects(filesClient([file]).files(company, uuid, 0), e => e.status === 400);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes('/Reporting/?'));
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('test-user:test-password').toString('base64'));
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ data: [record] }), { status: 200 });
  };
  await apiFetchBasic('/Reporting/', { company, uuid }, { KARTADO_USERNAME: 'test-user', KARTADO_PASSWORD: 'test-password' });
} finally { globalThis.fetch = originalFetch; }

const app = express(); let calls = 0;
app.use('/details', createReportingDetailRouter({ authenticate: (req, res, next) => req.headers.authorization ? next() : res.sendStatus(401), client: { get: async () => { calls++; return { success: true, ...detail }; }, files: async () => ({ success: true, ...files }) } }));
const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}/details/${uuid}?company=${company}`;
  assert.equal((await fetch(base)).status, 401); assert.equal(calls, 0);
  const response = await fetch(base, { headers: { Authorization: 'session-test' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).numero, 'TEST-01');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
console.log('Ficha do apontamento: Basic, filtros, campos dinâmicos, vínculos, arquivos, falhas parciais e autenticação OK.');

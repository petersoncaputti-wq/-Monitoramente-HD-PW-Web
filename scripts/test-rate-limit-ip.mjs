import assert from 'node:assert/strict';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { normalizeClientIp, clientIpKeyGenerator } from '../server/rate-limit-ip.mjs';

assert.equal(normalizeClientIp('203.0.113.10:54321'), '203.0.113.10');
assert.equal(normalizeClientIp('[2001:db8::1]:54321'), '2001:db8::1');
assert.equal(normalizeClientIp('2001:db8::1234'), '2001:db8::1234');
assert.equal(normalizeClientIp('::ffff:203.0.113.10'), '::ffff:203.0.113.10');
assert.equal(normalizeClientIp('invalid'), null);
assert.equal(clientIpKeyGenerator({ ip: 'invalid', socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
assert.equal(clientIpKeyGenerator({ ip: '2001:db8::1' }), clientIpKeyGenerator({ ip: '2001:db8::2' }));

const app = express();
app.set('trust proxy', 1);
const errors = [];
const originalError = console.error;
console.error = (...args) => errors.push(args);
app.use(rateLimit({ windowMs: 60000, limit: 2, keyGenerator: clientIpKeyGenerator, legacyHeaders: false }));
app.get('/', (_req, res) => res.sendStatus(200));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const send = ip => fetch(url, { headers: { 'X-Forwarded-For': ip } });
try {
  assert.equal((await send('203.0.113.10:10001')).status, 200);
  assert.equal((await send('203.0.113.10:10002')).status, 200);
  assert.equal((await send('203.0.113.10:10003')).status, 429);
  assert.equal((await send('203.0.113.11:10001')).status, 200);
  assert.equal((await send('[2001:db8::1]:10001')).status, 200);
  assert.equal((await send('2001:db8::2')).status, 200);
  assert.equal((await send('[2001:db8::3]:10002')).status, 429);
  assert.deepEqual(errors, []);
  console.log('Rate limit: Azure IP ports, separate clients, IPv6 subnets and validation passed.');
} finally {
  console.error = originalError;
  await new Promise(resolve => server.close(resolve));
}

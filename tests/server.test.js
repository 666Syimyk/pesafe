import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
const key = 'test-key-00000000000000000000000000000000';
async function setup(t, env = {}, transport = async () => { throw new Error('Real network forbidden in tests'); }) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pesafe-test-'));
  const server = await createApp({ dataDir, env: { DELIVERY_ACCESS_KEY: key, ...env }, transport });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, post: body => fetch(base + '/api/incidents', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) };
}
const incident = () => ({ id: crypto.randomUUID(), message: 'SOS Test, no real emergency.', createdAt: Date.now(), test: false });
test('закрытые файлы и токены не доступны через static server', async t => {
  const { base } = await setup(t);
  for (const name of ['.env', 'server.js', 'archive/app.js', 'package.json', '.data/delivery.sqlite', 'docs/PRD.md', '%2e%2e/.env']) assert.equal((await fetch(`${base}/${name}`)).status, 404);
  assert.equal((await fetch(base + '/')).status, 200); assert.equal((await fetch(base + '/api/health')).status, 401);
});
test('учебный сервер не вызывает транспорт', async t => {
  const { post } = await setup(t); const response = await post(incident()); assert.equal(response.status, 200); assert.equal((await response.json()).state, 'simulated');
});
test('даже на реальном сервере test=true ничего не отправляет', async t => {
  const { post } = await setup(t, { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '123' }); assert.equal((await (await post({ ...incident(), test: true })).json()).state, 'simulated');
});
test('идемпотентность и разные payload с тем же id', async t => {
  let calls = 0;
  const { post } = await setup(t, { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '123,456' }, async () => { calls++; return { ok: true, json: async () => ({ ok: true }) }; });
  const body = incident(); const first = await (await post(body)).json(); const second = await (await post(body)).json(); assert.equal(calls, 2); assert.deepEqual(second, first); assert.equal(first.state, 'accepted');
  assert.equal((await post({ ...body, message: 'Different message with same ID' })).status, 409);
});
test('повтор после перезапуска сервера использует квитанцию из SQLite', async t => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pesafe-restart-')); let calls = 0;
  const options = { dataDir, env: { DELIVERY_ACCESS_KEY: key, DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '123' }, transport: async () => { calls++; return { ok: true, json: async () => ({ ok: true }) }; } };
  const body = incident();
  for (let i = 0; i < 2; i++) { const server = await createApp(options); await new Promise(r => server.listen(0, '127.0.0.1', r)); const res = await fetch(`http://127.0.0.1:${server.address().port}/api/incidents`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: JSON.stringify(body) }); assert.equal(res.status, 200); await res.json(); await new Promise(r => server.close(r)); }
  assert.equal(calls, 1); await rm(dataDir, { recursive: true, force: true });
});
test('частичная отправка, отказ и неопределённый результат различаются', async t => {
  let call = 0;
  const { post } = await setup(t, { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '1,2,3' }, async () => { call++; if (call === 1) return { ok: true, json: async () => ({ ok: true }) }; if (call === 2) return { ok: false, json: async () => ({ ok: false }) }; throw new Error('timeout'); });
  const result = await (await post(incident())).json(); assert.equal(result.state, 'partial'); assert.equal(result.accepted, 1); assert.equal(result.unknown, 1); assert.equal(result.total, 3);
});
test('просроченное событие и поддельный origin отклоняются', async t => {
  const { post, base } = await setup(t); assert.equal((await post({ ...incident(), createdAt: Date.now() - 600000 })).status, 400);
  const r = await fetch(base + '/api/incidents', { method: 'POST', headers: { Authorization: `Bearer ${key}`, Origin: 'https://attacker.invalid' }, body: JSON.stringify(incident()) }); assert.equal(r.status, 403);
});
test('native CORS включается явно и не открывает доступ постороннему origin', async t => {
  const { base } = await setup(t, { NATIVE_ORIGINS: 'capacitor://localhost,https://localhost,*' });
  const preflight = await fetch(base + '/api/incidents', { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://localhost' } })).status, 401);
  const valid = await fetch(base + '/api/health', { headers: { Origin: 'https://localhost', Authorization: `Bearer ${key}` } }); assert.equal(valid.status, 200);
  assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://evil.invalid', Authorization: `Bearer ${key}` } })).status, 403);
});
test('явный отказ и потеря квитанции не превращаются в accepted', async t => {
  const env = { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '1' };
  const rejected = await setup(t, env, async () => ({ ok: false, json: async () => ({ ok: false }) }));
  assert.equal((await (await rejected.post(incident())).json()).state, 'failed');
  const uncertain = await setup(t, env, async () => { throw new Error('timeout'); });
  assert.equal((await (await uncertain.post(incident())).json()).state, 'unknown');
});
test('параллельный повтор не вызывает повторный транспорт', async t => {
  let calls = 0, release;
  const gate = new Promise(resolve => release = resolve);
  const { post } = await setup(t, { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '1' }, async () => { calls++; await gate; return { ok: true, json: async () => ({ ok: true }) }; });
  const body = incident(); const first = post(body);
  await new Promise(resolve => { const timer = setInterval(() => { if (calls) { clearInterval(timer); resolve(); } }, 5); });
  const duplicate = await post(body); assert.equal(duplicate.status, 202); assert.equal(calls, 1); release(); assert.equal((await first).status, 200);
});

// ===== Голосовая запись к тревоге =====
const audioPost = (base, id, body, type = 'audio/webm;codecs=opus', auth = true) => fetch(`${base}/api/incidents/${id}/audio`, { method: 'POST', headers: { 'Content-Type': type, ...(auth ? { Authorization: `Bearer ${key}` } : {}) }, body });
const sound = (size = 2000) => new Uint8Array(size).fill(7);
test('запись: без ключа, без тревоги, неверный формат и слишком большой файл отклоняются', async t => {
  const { base, post } = await setup(t);
  const body = incident();
  assert.equal((await audioPost(base, body.id, sound(), undefined, false)).status, 401);
  assert.equal((await audioPost(base, body.id, sound())).status, 404);
  await post(body);
  assert.equal((await audioPost(base, body.id, sound(), 'text/plain')).status, 415);
  assert.equal((await audioPost(base, body.id, sound(10))).status, 400);
  assert.equal((await audioPost(base, body.id, sound(3 * 1024 * 1024 + 10))).status, 413);
});
test('запись: учебный сервер не вызывает транспорт', async t => {
  const { base, post } = await setup(t);
  const body = incident(); await post(body);
  const result = await (await audioPost(base, body.id, sound())).json();
  assert.equal(result.state, 'simulated');
});
test('запись: реальная отправка файлом в Telegram, повтор не дублирует', async t => {
  const calls = [];
  const { base, post } = await setup(t, { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '11,22' }, async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ ok: true }) }; });
  const body = incident(); await post(body); calls.length = 0;
  const first = await (await audioPost(base, body.id, sound())).json();
  assert.equal(first.state, 'accepted'); assert.equal(first.accepted, 2); assert.equal(calls.length, 2);
  assert.ok(calls.every(c => c.url.endsWith('/sendDocument') && c.init.body instanceof FormData));
  const doc = calls[0].init.body.get('document');
  assert.equal(doc.type, 'audio/webm'); assert.equal(doc.size, 2000); assert.match(doc.name, /^pesafe-sos-.*\.webm$/);
  const second = await (await audioPost(base, body.id, sound())).json();
  assert.deepEqual(second, first); assert.equal(calls.length, 2);
});
test('запись к учебной тревоге (test=true) не отправляется даже на реальном сервере', async t => {
  let calls = 0;
  const { base, post } = await setup(t, { DELIVERY_DRY_RUN: 'false', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_IDS: '1' }, async () => { calls++; return { ok: true, json: async () => ({ ok: true }) }; });
  const body = { ...incident(), test: true }; await post(body);
  assert.equal((await (await audioPost(base, body.id, sound())).json()).state, 'simulated'); assert.equal(calls, 0);
});

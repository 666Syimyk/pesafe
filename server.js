import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = new Set(['index.html', 'style.css', 'app.js', 'core.js', 'calls.js', 'storage.js', 'retention.js', 'recordings.js', 'privacy.js', 'sounds.js', 'countdown-audio.js', 'sensors.js', 'recorder.js', 'runtime-config.js', 'sw.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const hash = value => createHash('sha256').update(value).digest('hex');
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
function authorized(req, key) {
  if (!key || key.length < 32) return false;
  const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
  return timingSafeEqual(Buffer.from(hash(supplied)), Buffer.from(hash(key)));
}
async function readJson(req) {
  let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 16000) throw new Error('size'); }
  return JSON.parse(body);
}
const MAX_AUDIO = 3 * 1024 * 1024;
const AUDIO_TYPES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' };
async function readBinary(req, max) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw new Error('size'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

// Приватный single-tenant gateway. Не является публичным многопользовательским API.
export async function createApp({ env = process.env, dataDir = path.join(ROOT, '.data'), transport = fetch } = {}) {
  await mkdir(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'delivery.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS incidents (id TEXT PRIMARY KEY, digest TEXT NOT NULL, state TEXT NOT NULL, result TEXT, created INTEGER NOT NULL)');
  db.exec('CREATE TABLE IF NOT EXISTS audio (id TEXT PRIMARY KEY, state TEXT NOT NULL, result TEXT, created INTEGER NOT NULL)');
  db.prepare('DELETE FROM incidents WHERE created < ?').run(Date.now() - 30 * 86400000);
  db.prepare('DELETE FROM audio WHERE created < ?').run(Date.now() - 30 * 86400000);
  const key = env.DELIVERY_ACCESS_KEY || '';
  const dryRun = env.DELIVERY_DRY_RUN !== 'false';
  const recipients = [...new Set((env.TELEGRAM_CHAT_IDS || '').split(/[\s,]+/).filter(Boolean))];
  const configured = key.length >= 32 && (dryRun || Boolean(env.TELEGRAM_BOT_TOKEN && recipients.length));
  const nativeOrigins = (env.NATIVE_ORIGINS || '').split(',').map(s => s.trim()).filter(origin => ['capacitor://localhost', 'https://localhost'].includes(origin));
  const limits = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(self), accelerometer=(self), gyroscope=(self)');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin && !['https://' + req.headers.host, 'http://' + req.headers.host, ...nativeOrigins].includes(origin)) return json(res, 403, { error: 'Origin rejected' });
        if (origin && nativeOrigins.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); }
        if (req.method === 'OPTIONS') { if (!origin || !nativeOrigins.includes(origin)) return json(res, 403, { error: 'Origin rejected' }); res.writeHead(204); return res.end(); }
        if (!authorized(req, key)) return json(res, 401, { error: 'Неверный ключ подключения' });
        if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { configured, dryRun, recipients: recipients.length });
        const audioRoute = url.pathname.match(/^\/api\/incidents\/([a-f0-9-]{36})\/audio$/i);
        if (audioRoute && req.method === 'POST') {
          // Голосовая запись к уже принятой тревоге. Файл пересылается в Telegram и не сохраняется на сервере.
          if (!configured) return json(res, 503, { error: 'Канал отправки не настроен на сервере' });
          const id = audioRoute[1];
          const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          if (!AUDIO_TYPES[type]) return json(res, 415, { error: 'Неподдерживаемый формат записи' });
          const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id);
          if (!incident) return json(res, 404, { error: 'Сначала должна быть принята сама тревога' });
          if (Date.now() - incident.created > 15 * 60000) return json(res, 400, { error: 'Тревога старше 15 минут. Отправьте запись вручную.' });
          const done = db.prepare('SELECT * FROM audio WHERE id = ?').get(id);
          if (done) return json(res, done.state === 'pending' ? 202 : 200, done.result ? JSON.parse(done.result) : { state: 'unknown', note: 'Отправка записи уже начата.' });
          const data = await readBinary(req, MAX_AUDIO).catch(() => null);
          if (!data) return json(res, 413, { error: 'Запись слишком большая (максимум 3 МБ)' });
          if (data.length < 100) return json(res, 400, { error: 'Пустая запись' });
          const minute = Math.floor(Date.now() / 60000); const count = limits.get(minute) || 0;
          if (count >= 6) return json(res, 429, { error: 'Слишком частые запросы. Отправьте запись вручную.' });
          limits.clear(); limits.set(minute, count + 1);
          db.prepare('INSERT INTO audio (id,state,created) VALUES (?,?,?)').run(id, 'pending', Date.now());
          const incidentState = incident.result ? JSON.parse(incident.result).state : 'unknown';
          let result;
          if (dryRun || incidentState === 'simulated') result = { state: 'simulated', accepted: 0, total: recipients.length, note: 'Учебный режим. Запись никому не отправлена.' };
          else {
            const filename = `pesafe-sos-${new Date(incident.created).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${AUDIO_TYPES[type]}`;
            const results = await Promise.allSettled(recipients.map(async chatId => {
              const form = new FormData();
              form.append('chat_id', chatId);
              form.append('caption', '🎙 Голосовая запись SOS · PeSafe. Записано с момента тревоги.');
              form.append('document', new Blob([data], { type }), filename);
              const response = await transport(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
              const reply = await response.json();
              return response.ok && reply.ok ? 'accepted' : 'rejected';
            }));
            const accepted = results.filter(r => r.status === 'fulfilled' && r.value === 'accepted').length;
            const unknown = results.filter(r => r.status === 'rejected').length;
            result = { state: accepted === recipients.length ? 'accepted' : accepted ? 'partial' : unknown ? 'unknown' : 'failed', accepted, total: recipients.length, unknown };
          }
          db.prepare('UPDATE audio SET state = ?, result = ? WHERE id = ?').run(result.state, JSON.stringify(result), id);
          return json(res, 200, result);
        }
        if (url.pathname !== '/api/incidents' || req.method !== 'POST') return json(res, 404, { error: 'Not found' });
        if (!configured) return json(res, 503, { error: 'Канал отправки не настроен на сервере' });
        const body = await readJson(req).catch(() => null);
        if (!body || !/^[a-f0-9-]{36}$/i.test(body.id || '') || typeof body.message !== 'string' || body.message.length < 10 || body.message.length > 3900 || typeof body.test !== 'boolean' || !Number.isFinite(body.createdAt) || Math.abs(Date.now() - body.createdAt) > 300000) return json(res, 400, { error: 'Некорректная или просроченная тревога (срок 5 минут)' });
        const digest = hash(body.message + body.test);
        const existing = db.prepare('SELECT * FROM incidents WHERE id = ?').get(body.id);
        if (existing) {
          if (existing.digest !== digest) return json(res, 409, { error: 'Идентификатор уже связан с другим сообщением' });
          return json(res, existing.state === 'pending' ? 202 : 200, existing.result ? JSON.parse(existing.result) : { state: 'unknown', note: 'Отправка начата. Повтор подавлен во избежание дубля.' });
        }
        const minute = Math.floor(Date.now() / 60000);
        const count = limits.get(minute) || 0;
        if (count >= 6) return json(res, 429, { error: 'Слишком частые запросы. Используйте звонок или SMS.' });
        limits.clear(); limits.set(minute, count + 1);
        db.prepare('INSERT INTO incidents (id,digest,state,created) VALUES (?,?,?,?)').run(body.id, digest, 'pending', Date.now());
        let result;
        if (dryRun || body.test) result = { state: 'simulated', accepted: 0, total: recipients.length, note: 'Учебный режим. Сообщение никому не отправлено.' };
        else {
          const results = await Promise.allSettled(recipients.map(async chatId => {
            const response = await transport(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
              body: JSON.stringify({ chat_id: chatId, text: body.message, link_preview_options: { is_disabled: true } })
            });
            const reply = await response.json();
            if (!response.ok || !reply.ok) return 'rejected';
            return 'accepted';
          }));
          const accepted = results.filter(r => r.status === 'fulfilled' && r.value === 'accepted').length;
          const unknown = results.filter(r => r.status === 'rejected').length;
          result = { state: accepted === recipients.length ? 'accepted' : accepted ? 'partial' : unknown ? 'unknown' : 'failed', accepted, total: recipients.length, unknown, note: 'Принятие Telegram не подтверждает прочтение или вызов служб.' };
        }
        db.prepare('UPDATE incidents SET state = ?, result = ? WHERE id = ?').run(result.state, JSON.stringify(result), body.id);
        return json(res, 200, result);
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
      const asset = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
      if (!ASSETS.has(asset)) { res.writeHead(404); return res.end('Not found'); }
      const data = await readFile(path.join(ROOT, asset));
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(asset)], 'Cache-Control': 'no-cache', ...(asset === 'sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { if (!res.headersSent) json(res, 500, { error: 'Сервер недоступен. Используйте звонок или SMS.' }); else res.end(); }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await createApp();
  server.listen(Number(process.env.PORT) || 8080, process.env.HOST || '127.0.0.1', () => console.log(`PeSafe: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 8080}\nДля телефона требуется HTTPS. Режим отправки: ${process.env.DELIVERY_DRY_RUN === 'false' ? 'Telegram (проверьте конфигурацию)' : 'учебный'}`));
}

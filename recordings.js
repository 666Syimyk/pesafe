import { audioExpiry } from './retention.js';
const DATABASE = 'pesafe-audio-v1';
const STORE = 'recordings';
const MAX_BYTES = 50 * 1024 * 1024;
let database;
function open() {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; resolve(db); };
    request.onerror = () => { database = null; reject(new Error('Хранилище записей недоступно')); };
    request.onblocked = () => reject(new Error('Закройте другие вкладки PeSafe для доступа к записям'));
  });
  return database;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); let result;
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(new Error('Не удалось сохранить или очистить записи')); tx.onabort = tx.onerror;
    operation(tx.objectStore(STORE), value => { result = value; }, tx);
  });
}
export async function purgeRecordings({ now = Date.now(), all = false } = {}) {
  return transaction('readwrite', (store, done) => {
    if (all) { store.clear(); done(true); return; }
    const cursor = store.openCursor(); cursor.onsuccess = () => { const row = cursor.result; if (!row) return done(true); if (!Number.isFinite(row.value.expiresAt) || row.value.expiresAt <= now) row.delete(); row.continue(); };
  });
}
export async function saveRecording(input, now = Date.now()) {
  if (!(input.blob instanceof Blob) || !input.blob.size || input.blob.size > 3 * 1024 * 1024 || !input.profileId) throw new Error('Запись пустая, слишком большая или профиль не подготовлен');
  const row = { id: input.id || crypto.randomUUID(), profileId: input.profileId, eventId: input.eventId || null, kind: input.kind === 'sos' ? 'sos' : 'ordinary', createdAt: input.createdAt, activatedAt: input.activatedAt || null, duration: input.duration, blob: input.blob, mime: input.blob.type || 'audio/webm' };
  row.expiresAt = audioExpiry({ ...row, profileExpiresAt: input.profileExpiresAt });
  if (!Number.isFinite(row.createdAt) || row.expiresAt <= now) throw new Error('Срок хранения этой записи истёк');
  await purgeRecordings({ now });
  return transaction('readwrite', (store, done, tx) => {
    const request = store.getAll(); request.onsuccess = () => {
      // Профиль мог быть удалён, пока завершалась асинхронная запись в другой вкладке.
      // Повторная проверка перед put не позволяет вернуть старое аудио после очистки.
      let owner;
      try { owner = JSON.parse(localStorage.getItem('pesafe.v2') || 'null'); } catch {}
      if (owner?.retention?.id !== row.profileId || owner.retention.expiresAt <= Date.now() || !owner.audioConsent) { tx.abort(); return; }
      const rows = request.result.filter(item => item.id !== row.id);
      if (rows.length >= 100 || rows.reduce((sum, item) => sum + item.blob.size, 0) + row.blob.size > MAX_BYTES) { tx.abort(); return; }
      store.put(row); done(row.id);
    };
  });
}
export async function listRecordings(profileId, now = Date.now()) {
  await purgeRecordings({ now });
  return transaction('readonly', (store, done) => {
    const rows = []; const cursor = store.openCursor(); cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return done(rows.sort((a, b) => b.createdAt - a.createdAt));
      if (row.value.profileId === profileId) { const { blob, ...metadata } = row.value; rows.push({ ...metadata, size: blob.size }); }
      row.continue();
    };
  });
}
export async function getRecording(id, profileId, now = Date.now()) {
  await purgeRecordings({ now });
  return transaction('readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result?.profileId === profileId ? request.result : null); });
}
export const deleteRecording = id => transaction('readwrite', (store, done) => { store.delete(id); done(true); });
export function recordingFilename(row) {
  const extension = row.mime.startsWith('audio/mp4') ? 'm4a' : row.mime.startsWith('audio/ogg') ? 'ogg' : 'webm';
  return `pesafe-${row.kind}-${new Date(row.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${extension}`;
}

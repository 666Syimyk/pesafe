import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, registrationPeriod, profileExpiry, audioExpiry, validPeriod } from '../retention.js';
import { loadStore, saveStore, emptyStore } from '../storage.js';
const storage = value => { const map = new Map([['pesafe.v2', JSON.stringify(value)]]); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; };
const store = now => ({ ...emptyStore(), onboarded: true, profile: { ...emptyStore().profile, firstName: 'Тест', lastName: 'Тестовый' }, contacts: [{ id: 'c', name: 'Контакт', phone: '+996555000001' }], retention: registrationPeriod(now), history: [{ id: 'old', createdAt: now, status: 'resolved' }] });
test('год хранения и предупреждение за 30 дней без продления при сохранении', () => {
  const now = Date.parse('2026-11-13T00:00:00Z'), state = store(now), expires = state.retention.expiresAt;
  assert.equal(new Date(expires).toISOString(), '2027-11-13T00:00:00.000Z');
  assert.equal(profileExpiry(state.retention, expires - 31 * DAY).warning, false); assert.equal(profileExpiry(state.retention, expires - 30 * DAY).warning, true);
  const disk = storage(state); state.profile.firstName = 'Новое имя'; saveStore(state, disk); assert.equal(loadStore(disk, now + DAY).retention.expiresAt, expires);
});
test('по сроку очищаются профиль, контакты, история и согласие; ставится флаг очистки аудио', () => {
  const now = Date.now(), initial = store(now - 370 * DAY); initial.audioConsent = { version: 1, grantedAt: now - DAY };
  const disk = storage(initial), result = loadStore(disk, now);
  assert.equal(result.onboarded, false); assert.equal(result.profile.firstName, ''); assert.deepEqual(result.contacts, []); assert.deepEqual(result.history, []); assert.equal(result.audioConsent, null); assert.equal(result.pendingAudioPurge, true);
  assert.equal(JSON.parse(disk.getItem('pesafe.v2')).profile.firstName, '');
});
test('очистка профиля не прерывает активный SOS', () => {
  const now = Date.now(), initial = store(now - 370 * DAY);
  initial.emergency = { id: crypto.randomUUID(), status: 'active', test: false, createdAt: now - 10000, deadline: now, activatedAt: now };
  const loaded = loadStore(storage(initial), now); assert.equal(loaded.onboarded, true); assert.equal(loaded.emergency.status, 'active'); assert.equal(profileExpiry(loaded.retention, now).expired, true);
});
test('миграция существующего профиля задаёт срок один раз и требует нового согласия на архив', () => {
  const now = Date.now(), initial = store(now); delete initial.retention; initial.settings.recordAudio = true;
  const disk = storage(initial), first = loadStore(disk, now), second = loadStore(disk, now + DAY);
  assert.equal(first.settings.recordAudio, false); assert.equal(first.retention.expiresAt, second.retention.expiresAt);
});
test('обычная запись — сутки, SOS — 30 дней, срок профиля ограничивает оба', () => {
  const createdAt = Date.now();
  assert.equal(audioExpiry({ kind: 'ordinary', createdAt }), createdAt + DAY);
  assert.equal(audioExpiry({ kind: 'sos', createdAt, activatedAt: createdAt + 25000 }), createdAt + 25000 + 30 * DAY);
  assert.equal(audioExpiry({ kind: 'sos', createdAt, profileExpiresAt: createdAt + DAY }), createdAt + DAY);
  assert.equal(validPeriod({ id: 'x', registeredAt: createdAt + DAY, expiresAt: createdAt + 100 * DAY }, createdAt), false);
});

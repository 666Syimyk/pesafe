import test from 'node:test';
import assert from 'node:assert/strict';
import { EmergencyMachine, SignalGate, buildMessage, freshLocation, validPhone, profileErrors, ageOf, DEFAULTS } from '../core.js';
import { loadStore, emptyStore } from '../storage.js';

const profile = { firstName: 'Тест', lastName: 'Пользователь', patronymic: '', phone: '+996555000001', birthDate: '1995-03-12', address: 'Тестовый адрес', conditions: 'Личное заболевание', blood: 'A (II) Rh+', allergies: 'Личная аллергия', medication: '' };
test('полный профиль и международные номера; невозможные даты не принимаются', () => {
  assert.deepEqual(profileErrors(profile), {});
  assert.equal(validPhone('+996 (555) 000-001'), true);
  for (const phone of ['112', 'abc', '+0555000000', '+1234567890123456']) assert.equal(validPhone(phone), false);
  assert.equal(ageOf('2025-02-31'), null); assert.equal(ageOf('2099-01-01'), null); assert.equal(ageOf(''), null);
  assert.equal(ageOf('1995-03-12', new Date('2026-01-01')), 30);
});
test('отмена отсчёта не может стать активным SOS', () => {
  let now = 1000; const events = [];
  const m = new EmergencyMachine({ now: () => now, onChange: e => events.push(e) });
  m.start('sound', 10); assert.equal(m.remaining(), 10); assert.equal(m.cancel(), true);
  now += 20000; m.tick(); assert.equal(m.activate(), false); assert.equal(m.value.status, 'cancelled'); assert.equal(events.length, 2);
});
test('deadline переживает задержку таймера, активация ровно один раз', () => {
  let now = 1000, active = 0;
  const m = new EmergencyMachine({ now: () => now, onChange: e => { if (e.status === 'active') active++; } });
  m.start('manual', 10); now = 11999; m.tick(); m.tick();
  assert.equal(active, 1); assert.equal(m.start(), false); assert.equal(m.cancel(), false); assert.equal(m.finish(), true); assert.equal(m.finish(), false);
});
test('восстановление отсчёта использует прежний deadline', () => {
  const restored = { id: crypto.randomUUID(), status: 'countdown', deadline: 11000, createdAt: 1000, test: true, reason: 'test' };
  const m = new EmergencyMachine({ restored, now: () => 12000 }); m.tick(); assert.equal(m.value.status, 'active'); assert.equal(m.value.test, true);
});
test('тестовый режим сохраняется на всём жизненном цикле', () => {
  const m = new EmergencyMachine(); m.start('test', 10, true); m.activate(); m.finish(); assert.equal(m.value.test, true);
});
test('краткий шум не проходит, длительный проходит, есть cooldown', () => {
  const gate = new SignalGate(); assert.equal(gate.sound(95, 88, 1000), false); assert.equal(gate.sound(95, 88, 1100), false);
  gate.sound(20, 88, 1150); assert.equal(gate.sound(95, 88, 1200), false); assert.equal(gate.sound(95, 88, 1450), true); assert.equal(gate.sound(95, 88, 1600), false);
});
test('одиночное ускорение не запускает тревогу, серия — запускает', () => {
  const gate = new SignalGate(); assert.equal(gate.motion(25, 1000), false); assert.equal(gate.motion(25, 1050), false); assert.equal(gate.motion(25, 1200), false); assert.equal(gate.motion(25, 1400), true); assert.equal(gate.motion(25, 1600), false);
});
test('старые, некорректные и будущие координаты не выдаются за текущие', () => {
  const loc = { lat: 42.87, lng: 74.6, accuracy: 20, timestamp: 1000000 };
  assert.equal(freshLocation(loc, 1100000), loc); assert.equal(freshLocation(loc, 1200000), null); assert.equal(freshLocation({ ...loc, lat: 100 }, 1100000), null); assert.equal(freshLocation({ ...loc, timestamp: 3000000 }, 1100000), null);
});
test('медданные не отправляются без отдельного согласия', () => {
  const now = Date.now(), location = { lat: 42.87, lng: 74.6, accuracy: 20, timestamp: now };
  const msg = buildMessage({ profile, settings: DEFAULTS, reason: 'motion', location, now });
  assert.ok(!msg.includes(profile.conditions)); assert.ok(!msg.includes(profile.allergies)); assert.ok(msg.includes('не место происшествия')); assert.ok(msg.includes('обстоятельства не подтверждены')); assert.ok(msg.includes('42.870000'));
  assert.ok(buildMessage({ profile, settings: { ...DEFAULTS, shareMedical: true }, reason: 'manual', now }).includes(profile.allergies));
});
test('учебное сообщение явно маркировано, отсутствие GPS явно указано', () => {
  const msg = buildMessage({ profile, settings: DEFAULTS, reason: 'test', test: true }); assert.ok(msg.startsWith('УЧЕБНАЯ')); assert.ok(msg.includes('местоположение недоступно'));
});
const fakeStorage = initial => { const data = new Map(Object.entries(initial)); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; };
test('миграция v1 сохраняет контакты, удаляет клиентский токен бота', () => {
  const storage = fakeStorage({ 'pesafe.v1': JSON.stringify({ userName: 'Тест', contacts: [{ name: 'Контакт', phone: '+996555000002' }], botToken: 'do-not-preserve' }) });
  const result = loadStore(storage); assert.equal(result.contacts.length, 1); assert.equal(storage.getItem('pesafe.v1'), null); assert.ok(!JSON.stringify(result).includes('do-not-preserve'));
});
test('повреждённое хранилище не ломает приложение', () => {
  assert.deepEqual(loadStore(fakeStorage({ 'pesafe.v2': 'broken' })), emptyStore());
  const result = loadStore(fakeStorage({ 'pesafe.v2': JSON.stringify({ contacts: 'oops', history: null, settings: { countdown: -20, threshold: 500 } }) })); assert.equal(result.settings.countdown, 10); assert.equal(result.settings.threshold, 99); assert.deepEqual(result.contacts, []);
});

test('подсказка для звонка: координаты, без медданных без согласия; временный номер вместо 112', async () => {
  const { dispatcherScript } = await import('../core.js');
  const now = Date.now(); const location = { lat: 42.87, lng: 74.57, accuracy: 25, timestamp: now };
  const text = dispatcherScript({ profile, location, reason: 'sound', settings: DEFAULTS, now });
  assert.ok(text.includes('PeSafe')); assert.ok(text.includes('42.870000, 74.570000')); assert.ok(text.includes('Резкий громкий звук'));
  assert.ok(!text.includes(profile.allergies));
  assert.ok(dispatcherScript({ profile, location, reason: 'manual', settings: { ...DEFAULTS, shareMedical: true }, now }).includes(profile.allergies));
  assert.ok(dispatcherScript({ profile, location: null, reason: 'manual', settings: DEFAULTS, now }).includes('ориентиры'));
  const msg = buildMessage({ profile, settings: { ...DEFAULTS, recordAudio: true }, reason: 'manual', now });
  assert.ok(msg.includes('+996 221 212 111')); assert.ok(!msg.includes('позвоните 112')); assert.ok(msg.includes('Голосовая запись'));
  assert.ok(!buildMessage({ profile, settings: { ...DEFAULTS, recordAudio: true }, reason: 'test', test: true, now }).includes('Голосовая запись'));
});

test('двойное предупреждение: 10 с → пауза 5 с → 10 с → SOS; отмена на любом этапе', () => {
  let now = 0; let active = 0;
  const m = new EmergencyMachine({ now: () => now, onChange: e => { if (e.status === 'active') active++; } });
  m.start('sound', 10, false, true);
  assert.equal(m.phase(), 'first'); assert.equal(m.remaining(), 10);
  now = 9999; m.tick(); assert.equal(m.phase(), 'first'); assert.equal(m.value.status, 'countdown');
  now = 10000; m.tick(); assert.equal(m.phase(), 'pause'); assert.equal(m.remaining(), 5); assert.equal(m.value.status, 'countdown');
  now = 15000; assert.equal(m.phase(), 'second'); assert.equal(m.remaining(), 10);
  now = 24999; m.tick(); assert.equal(active, 0);
  now = 25000; m.tick(); assert.equal(active, 1); assert.equal(m.value.status, 'active');
  for (const at of [3000, 12000, 20000]) {
    const c = new EmergencyMachine({ now: () => now }); now = 0; c.start('motion', 10, false, true); now = at;
    assert.equal(c.cancel(), true); now = 60000; c.tick(); assert.equal(c.value.status, 'cancelled');
  }
  const single = new EmergencyMachine({ now: () => now }); now = 0; single.start('manual', 10);
  assert.equal(single.phase(), 'single'); now = 10000; single.tick(); assert.equal(single.value.status, 'active');
});
test('двойная тревога восстанавливается после перезагрузки, подделка отбрасывается', () => {
  const ok = { id: 'x', status: 'countdown', reason: 'sound', test: false, createdAt: Date.now(), deadline: Date.now() + 25000, stageMs: 10000 };
  const mem = data => ({ getItem: () => JSON.stringify({ ...emptyStore(), onboarded: true, emergency: data }), setItem() {}, removeItem() {} });
  assert.equal(loadStore(mem(ok)).emergency.stageMs, 10000);
  assert.equal(loadStore(mem({ ...ok, stageMs: 999999 })).emergency, null);
  assert.equal(loadStore(mem({ ...ok, deadline: ok.createdAt + 600000 })).emergency, null);
  assert.equal(DEFAULTS.doubleCheck, true);
});

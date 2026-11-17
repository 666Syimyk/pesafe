import test from 'node:test';
import assert from 'node:assert/strict';
import { CallCoordinator } from '../calls.js';
import { EmergencyMachine } from '../core.js';
const target = { number: '+996221212111', autoCall: true };
function fixture() {
  let now = 1000, visible = true; const requests = [], updates = [];
  const coordinator = new CallCoordinator({ now: () => now, visible: () => visible, open: uri => requests.push(uri), onUpdate: (id, fields) => updates.push({ id, ...fields }) });
  return { coordinator, requests, updates, setTime: value => now = value, setVisible: value => visible = value };
}
const event = () => ({ id: crypto.randomUUID(), status: 'active', test: false, createdAt: 1000, callTarget: target.number });
test('только активированный SOS запрашивает звонок, учебный и отменённый не запрашивают', () => {
  const f = fixture(); for (const status of ['idle', 'countdown', 'cancelled', 'resolved']) f.coordinator.request({ ...event(), status }, target);
  f.coordinator.request({ ...event(), test: true }, target); assert.equal(f.requests.length, 0);
  f.coordinator.request(event(), target); assert.deepEqual(f.requests, ['tel:+996221212111']); assert.equal(f.updates[0].callState, 'requested');
});
test('два предупреждения и пауза завершаются до единственного запроса звонка', () => {
  const f = fixture(), m = new EmergencyMachine({ now: () => now, onChange: value => f.coordinator.request(value, target) }); let now = 1000;
  m.start('manual', 10, false, true);
  for (const time of [11000, 16000, 25999]) { now = time; f.setTime(time); m.tick(); assert.equal(f.requests.length, 0); }
  now = 26000; f.setTime(now); m.tick(); m.tick(); assert.equal(f.requests.length, 1);
});
test('повтор и восстановление уже запрошенного вызова не дублируют попытку', () => {
  const f = fixture(), e = event(); f.coordinator.request(e, target); f.coordinator.request(e, target); assert.equal(f.requests.length, 1);
  const second = fixture(); second.coordinator.request({ ...e, callRequestedAt: 1000 }, target); assert.equal(second.requests.length, 0);
});
test('скрытая страница откладывает попытку; видимая выполняет один раз', () => {
  const f = fixture(), e = event(); f.setVisible(false); f.coordinator.request(e, target); assert.equal(f.updates.at(-1).callState, 'deferred'); assert.equal(f.requests.length, 0); f.setVisible(true); f.coordinator.request(e, target); assert.equal(f.requests.length, 1);
});
test('старый SOS, изменённый или некорректный номер не набираются', () => {
  const f = fixture(); f.setTime(400000); f.coordinator.request(event(), target); assert.equal(f.updates.at(-1).callState, 'expired');
  f.setTime(1000); f.coordinator.request({ ...event(), callTarget: '+996555000001' }, target); assert.equal(f.updates.at(-1).callState, 'changed');
  f.coordinator.request({ ...event(), callTarget: 'javascript:bad' }, target); assert.equal(f.updates.at(-1).callState, 'invalid'); assert.equal(f.requests.length, 0);
});
test('ошибка транспорта отмечается как блокировка, без автоматических повторов', () => {
  const updates = [], e = event(); let count = 0;
  const coordinator = new CallCoordinator({ now: () => 1000, visible: () => true, open: () => { count++; throw new Error('blocked'); }, onUpdate: (id, fields) => updates.push(fields) }); coordinator.request(e, target); coordinator.request(e, target);
  assert.equal(count, 1); assert.equal(updates.at(-1).callState, 'blocked');
});
test('при ошибке сохранения отметки телефон не открывается', () => {
  let opened = false; const coordinator = new CallCoordinator({ now: () => 1000, visible: () => true, open: () => opened = true, onUpdate: () => false }); assert.equal(coordinator.request(event(), target), false); assert.equal(opened, false);
});

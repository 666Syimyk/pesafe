import test from 'node:test';
import assert from 'node:assert/strict';
import { CountdownAudio, countdownCue } from '../countdown-audio.js';
function fixture() {
  const starts = [], immediateStops = [], gains = [];
  const context = { state: 'running', currentTime: 0, destination: {}, resume: async () => { context.state = 'running'; }, suspend: async () => { context.state = 'suspended'; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { gains.push(value); } }, connect() {}, disconnect() {} }), createOscillator: () => {
    const node = { frequency: { setValueAtTime(value) { node.hz = value; } }, connect() {}, disconnect() {}, start(at) { starts.push({ hz: node.hz, at }); }, stop(at) { if (at === undefined) immediateStops.push(node); } }; return node;
  } };
  let visible = true;
  const audio = new CountdownAudio({ environment: { createContext: () => context }, visible: () => visible });
  return { audio, context, starts, immediateStops, gains, setVisible: value => visible = value };
}
const event = { id: 'test', status: 'countdown' };
test('сигналы различаются по этапам и усиливаются только перед финальным SOS', () => {
  assert.equal(countdownCue('first', 10).length, 1); assert.equal(countdownCue('pause', 5, true).length, 2); assert.equal(countdownCue('pause', 4, false).length, 0);
  assert.equal(countdownCue('second', 8).length, 2); assert.equal(countdownCue('second', 3).length, 3); assert.equal(countdownCue('single', 1).length, 3); assert.equal(countdownCue('second', 0).length, 0);
});
test('150-мс обновления не умножают звуковые сигналы одной секунды', async () => {
  const f = fixture(); await f.audio.unlock(); for (let i = 0; i < 10; i++) f.audio.update({ event, phase: 'first', remaining: 10 }); assert.equal(f.starts.length, 1);
  f.audio.update({ event, phase: 'first', remaining: 9 }); assert.equal(f.starts.length, 2); assert.ok(f.gains.every(value => value >= 0 && value <= .13));
});
test('отмена и активированный SOS немедленно останавливают все запланированные тоны', async () => {
  const f = fixture(); await f.audio.unlock(); f.audio.update({ event, phase: 'second', remaining: 2 }); assert.equal(f.starts.length, 3);
  f.audio.update({ event: { ...event, status: 'cancelled' }, phase: 'second', remaining: 1 }); assert.equal(f.immediateStops.length, 3); assert.equal(f.audio.nodes.size, 0);
  f.audio.update({ event: { ...event, status: 'active' }, phase: 'second', remaining: 0 }); assert.equal(f.starts.length, 3);
});
test('тихий режим не играет; включение разрешает сигналы снова', async () => {
  const f = fixture(); await f.audio.unlock(); f.audio.update({ event, phase: 'first', remaining: 10, enabled: false }); assert.equal(f.starts.length, 0);
  f.audio.update({ event, phase: 'first', remaining: 9, enabled: true }); assert.equal(f.starts.length, 1);
});
test('недоступный аудиодвижок не мешает работе таймера', async () => {
  const audio = new CountdownAudio({ environment: { createContext: () => { throw new Error('unsupported'); } }, visible: () => true }); assert.equal(await audio.unlock(), false); assert.equal(audio.status, 'unavailable'); assert.doesNotThrow(() => audio.update({ event, phase: 'first', remaining: 10 }));
});
test('скрытие страницы останавливает звук и не воспроизводит пропущенные секунды', async () => {
  const f = fixture(); await f.audio.unlock(); f.audio.update({ event, phase: 'first', remaining: 10 }); f.setVisible(false); f.audio.update({ event, phase: 'first', remaining: 9 }); assert.equal(f.immediateStops.length, 1);
  f.setVisible(true); f.audio.update({ event, phase: 'second', remaining: 2 }); assert.equal(f.starts.length, 4);
});

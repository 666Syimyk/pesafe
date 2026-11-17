export const audioEnvironment = {
  createContext: () => {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Web Audio unavailable');
    return new Audio();
  },
};

export function countdownCue(phase, seconds, enteredPhase = false) {
  if (seconds <= 0) return [];
  if (phase === 'pause') return enteredPhase ? [{ frequency: 440, duration: .08, offset: 0 }, { frequency: 520, duration: .08, offset: .18 }] : [];
  if ((phase === 'second' || phase === 'single') && seconds <= 3) return [0, .13, .26].map((offset, i) => ({ frequency: 900 + i * 70, duration: .075, offset }));
  if (phase === 'second') return [{ frequency: 780, duration: .08, offset: 0 }, { frequency: 880, duration: .08, offset: .16 }];
  return [{ frequency: seconds <= 3 ? 740 : 660, duration: .075, offset: 0 }];
}

export class CountdownAudio {
  constructor({ environment = audioEnvironment, onStatus = () => {}, visible = () => !document.hidden } = {}) {
    this.environment = environment; this.onStatus = onStatus; this.visible = visible;
    this.context = null; this.nodes = new Set(); this.eventId = null; this.lastKey = null; this.lastPhase = null; this.status = 'locked';
  }
  setStatus(status) { if (this.status !== status) { this.status = status; this.onStatus(status); } }
  async unlock() {
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.environment.createContext();
        const current = this.context;
        current.onstatechange = () => { if (current !== this.context) return; if (current.state !== 'running') this.stop(); this.setStatus(current.state === 'running' ? 'ready' : 'locked'); };
      }
      if (this.context.state !== 'running') { this.setStatus('locked'); await this.context.resume(); }
      this.setStatus(this.context.state === 'running' ? 'ready' : 'locked'); return this.status === 'ready';
    } catch { this.setStatus(this.context ? 'locked' : 'unavailable'); return false; }
  }
  update({ event, phase, remaining, enabled = true }) {
    if (!enabled || event.status !== 'countdown' || !this.visible()) { this.stop(); return; }
    if (this.eventId !== event.id) { this.stop(); this.eventId = event.id; }
    if (this.status === 'unavailable') return;
    if (!this.context || this.context.state !== 'running') { if (this.status !== 'unavailable') this.setStatus('locked'); return; }
    this.setStatus('ready');
    const key = `${event.id}:${phase}:${remaining}`;
    if (key === this.lastKey) return;
    const entered = phase !== this.lastPhase; this.lastPhase = phase; this.lastKey = key;
    const cue = countdownCue(phase, remaining, entered);
    for (const tone of cue) this.tone(tone, phase === 'second' || (phase === 'single' && remaining <= 3) ? .13 : .09);
  }
  tone({ frequency, duration, offset }, volume) {
    try {
      const context = this.context, oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + offset, end = start + duration;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .01); gain.gain.linearRampToValueAtTime(0, end);
      oscillator.connect(gain); gain.connect(context.destination);
      const entry = { oscillator, gain }; this.nodes.add(entry);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.nodes.delete(entry); };
      oscillator.start(start); oscillator.stop(end + .005);
    } catch { this.stop(); this.setStatus('unavailable'); }
  }
  stop() {
    for (const { oscillator, gain } of this.nodes) { oscillator.onended = null; try { oscillator.stop(); oscillator.disconnect(); gain.disconnect(); } catch {} }
    this.nodes.clear(); this.eventId = null; this.lastKey = null; this.lastPhase = null;
  }
  suspend() { this.stop(); if (this.context?.state === 'running') this.context.suspend().catch(() => {}); this.setStatus('locked'); }
}

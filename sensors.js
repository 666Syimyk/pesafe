import { SignalGate } from './core.js';
export class Sensors {
  constructor({ signal, status, level }) {
    this.signal = signal; this.status = status; this.level = level;
    this.gate = new SignalGate(); this.stream = null; this.context = null; this.recognition = null; this.running = false; this.generation = 0;
    this.motionHandler = e => {
      const a = e.acceleration;
      if (!a || [a.x, a.y, a.z].some(v => typeof v !== 'number')) return;
      this.status('motion', 'active');
      if (this.gate.motion(Math.hypot(a.x, a.y, a.z), Date.now())) this.signal('motion');
    };
  }
  async start(settings) {
    this.stop(); const generation = ++this.generation; this.running = true; this.settings = { ...settings };
    let motionPermission = Promise.resolve('granted');
    if (settings.motion && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') motionPermission = DeviceMotionEvent.requestPermission().catch(() => 'denied');
    const results = await Promise.allSettled([
      settings.sound && navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }) : Promise.resolve(null),
      motionPermission
    ]);
    if (generation !== this.generation || !this.running) { if (results[0].status === 'fulfilled') results[0].value?.getTracks().forEach(t => t.stop()); return; }
    if (settings.sound) {
      if (results[0].status === 'fulfilled' && results[0].value) {
        try {
          this.stream = results[0].value;
          const Audio = window.AudioContext || window.webkitAudioContext;
          this.context = new Audio(); await this.context.resume();
          if (generation !== this.generation) return;
          const analyser = this.context.createAnalyser(); analyser.fftSize = 2048;
          this.context.createMediaStreamSource(this.stream).connect(analyser);
          const buffer = new Float32Array(analyser.fftSize);
          this.status('sound', 'active');
          this.stream.getAudioTracks()[0].onended = () => this.status('sound', 'error');
          this.timer = setInterval(() => {
            if (document.hidden || this.context?.state !== 'running') { this.status('sound', 'paused'); return; }
            this.status('sound', 'active'); analyser.getFloatTimeDomainData(buffer);
            const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length);
            const level = Math.max(0, Math.min(100, 100 + 20 * Math.log10(rms || 1e-8)));
            this.level(level);
            if (this.gate.sound(level, this.settings.threshold, Date.now())) this.signal('sound');
          }, 50);
        } catch { this.stream?.getTracks().forEach(t => t.stop()); this.status('sound', 'error'); }
      } else this.status('sound', navigator.mediaDevices?.getUserMedia ? 'denied' : 'unsupported');
    }
    if (settings.motion) {
      if (typeof DeviceMotionEvent !== 'undefined' && results[1].status === 'fulfilled' && results[1].value === 'granted') {
        addEventListener('devicemotion', this.motionHandler); this.status('motion', 'waiting');
      } else this.status('motion', typeof DeviceMotionEvent === 'undefined' ? 'unsupported' : 'denied');
    }
    if (settings.voice) this.startVoice(generation);
  }
  startVoice(generation) {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return this.status('voice', 'unsupported');
    const speech = new Speech(); this.recognition = speech;
    speech.lang = 'ru-RU'; speech.continuous = true; speech.interimResults = false;
    speech.onstart = () => this.status('voice', 'active');
    speech.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript.toLocaleLowerCase('ru-RU');
        if (e.results[i].isFinal && /(?:помоги(?:те)?\s+мне|мне\s+нужна\s+помощь|вызови(?:те)?\s+помощь)/u.test(text) && Date.now() > this.gate.cooldown) { this.gate.suppress(); this.signal('voice'); }
      }
    };
    speech.onerror = () => { this.voiceFailed = true; this.status('voice', 'error'); };
    speech.onend = () => {
      if (this.running && generation === this.generation && !this.voiceFailed && !document.hidden) this.voiceTimer = setTimeout(() => { try { speech.start(); } catch { this.status('voice', 'error'); } }, 800);
    };
    this.voiceFailed = false;
    try { speech.start(); } catch { this.status('voice', 'error'); }
  }
  stop() {
    this.generation++; this.running = false; clearInterval(this.timer); clearTimeout(this.voiceTimer);
    removeEventListener('devicemotion', this.motionHandler);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    if (this.recognition) { this.recognition.onend = null; this.recognition.abort(); this.recognition = null; }
    this.context?.close().catch(() => {}); this.context = null;
    this.level(0);
    for (const key of ['sound', 'motion', 'voice']) this.status(key, 'off');
  }
}

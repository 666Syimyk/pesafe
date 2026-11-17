// Голосовая запись SOS: начинается вместе с тревогой, длится до RECORD_SECONDS.
// Этот класс держит текущий буфер в памяти. Архив с TTL управляется recordings.js.
export const RECORD_SECONDS = 30;
const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

export const recorderSupported = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

function pickType() {
  for (const type of TYPES) { try { if (MediaRecorder.isTypeSupported?.(type)) return type; } catch {} }
  return '';
}

export class SosRecorder {
  constructor({ onState = () => {} } = {}) { this.onState = onState; this.clear(); }
  clear() {
    this.state = 'idle'; this.eventId = null; this.recorder = null; this.stream = null; this.chunks = [];
    this.blob = null; this.url = ''; this.duration = 0; this.startedAt = 0; this.timer = 0; this.waiters = [];
  }
  set(state) { this.state = state; this.onState(state); if (['ready', 'error', 'denied', 'unsupported'].includes(state)) this.waiters.splice(0).forEach(resolve => resolve()); }
  elapsed() { return this.startedAt ? Math.min(RECORD_SECONDS, Math.floor((Date.now() - this.startedAt) / 1000)) : 0; }
  async start(eventId, seconds = RECORD_SECONDS) {
    this.discard();
    this.eventId = eventId;
    if (!recorderSupported()) return this.set('unsupported');
    this.set('requesting');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }); }
    catch { if (this.eventId === eventId) this.set('denied'); return; }
    // Тревогу могли отменить, пока браузер спрашивал разрешение.
    if (this.eventId !== eventId) { stream.getTracks().forEach(t => t.stop()); return; }
    if (document.hidden) { stream.getTracks().forEach(t => t.stop()); this.set('error'); return; }
    try {
      const type = pickType();
      const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
      this.stream = stream; this.recorder = recorder; this.chunks = [];
      recorder.ondataavailable = e => { if (e.data?.size) this.chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (this.stream === stream) this.stream = null;
        if (this.eventId !== eventId) return;
        this.blob = new Blob(this.chunks, { type: recorder.mimeType || type || 'audio/webm' });
        this.duration = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
        this.chunks = [];
        if (!this.blob.size) return this.set('error');
        this.url = URL.createObjectURL(this.blob);
        this.set('ready');
      };
      recorder.onerror = () => { stream.getTracks().forEach(t => t.stop()); if (this.eventId === eventId) this.set('error'); };
      recorder.start(1000);
      this.startedAt = Date.now();
      this.set('recording');
      this.timer = setTimeout(() => this.stop(), seconds * 1000);
    } catch {
      stream.getTracks().forEach(t => t.stop());
      this.set('error');
    }
  }
  // Завершить запись досрочно и сохранить то, что успело записаться.
  stop() { clearTimeout(this.timer); if (this.recorder?.state !== 'recording') return Promise.resolve(); const ready = new Promise(resolve => this.waiters.push(resolve)); this.recorder.stop(); return ready; }
  // Удалить запись без сохранения (отмена тревоги, завершение SOS).
  discard() {
    this.waiters.splice(0).forEach(resolve => resolve());
    clearTimeout(this.timer);
    const recorder = this.recorder;
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; if (recorder.state === 'recording') { try { recorder.stop(); } catch {} } }
    this.stream?.getTracks().forEach(t => t.stop());
    if (this.url) URL.revokeObjectURL(this.url);
    const wasIdle = this.state === 'idle';
    this.clear();
    if (!wasIdle) this.onState('idle');
  }
  file() {
    if (!this.blob) return null;
    const type = this.blob.type.split(';')[0];
    const ext = type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm';
    return new File([this.blob], `pesafe-sos-${new Date(this.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: this.blob.type });
  }
}

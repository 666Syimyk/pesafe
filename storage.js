import { DEFAULTS, EMPTY_PROFILE, normalizePhone, validPhone } from './core.js';
import { registrationPeriod, validPeriod, profileExpiry, hasAudioConsent } from './retention.js';
const KEY = 'pesafe.v2';
export const emptyStore = () => ({ version: 2, onboarded: false, profile: { ...EMPTY_PROFILE }, contacts: [], settings: { ...DEFAULTS }, history: [], emergency: null, retention: null, audioConsent: null, pendingAudioPurge: false });
export function loadStore(storage = localStorage, now = Date.now()) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) {
      const legacy = JSON.parse(storage.getItem('pesafe.v1') || 'null');
      const next = emptyStore();
      if (legacy) {
        next.profile.firstName = String(legacy.userName || '').slice(0, 60);
        next.contacts = (Array.isArray(legacy.contacts) ? legacy.contacts : []).filter(c => c && validPhone(c.phone)).map(c => ({ id: crypto.randomUUID(), name: String(c.name).slice(0, 60), phone: normalizePhone(c.phone), relation: 'Близкий человек' }));
        // Старые botToken никогда не переносим в клиентскую конфигурацию.
        next.retention = registrationPeriod(now); storage.setItem(KEY, JSON.stringify(next)); storage.removeItem('pesafe.v1');
      }
      return next;
    }
    const parsed = JSON.parse(raw);
    const next = { ...emptyStore(), onboarded: parsed.onboarded === true, profile: { ...EMPTY_PROFILE }, settings: { ...DEFAULTS } };
    for (const key of Object.keys(EMPTY_PROFILE)) next.profile[key] = String(parsed.profile?.[key] || '').slice(0, 500);
    next.settings.countdown = [5, 10, 15, 20, 30].includes(parsed.settings?.countdown) ? parsed.settings.countdown : 10;
    next.settings.threshold = Math.max(65, Math.min(99, Number(parsed.settings?.threshold) || 88));
    for (const key of ['sound', 'motion', 'voice', 'shareMedical', 'autoDelivery', 'recordAudio', 'doubleCheck', 'alertSounds']) next.settings[key] = typeof parsed.settings?.[key] === 'boolean' ? parsed.settings[key] : DEFAULTS[key];
    next.contacts = (Array.isArray(parsed.contacts) ? parsed.contacts : []).filter(c => c && validPhone(c.phone)).slice(0, 10).map(c => ({ id: String(c.id || crypto.randomUUID()), name: String(c.name || '').slice(0, 60), phone: normalizePhone(c.phone), relation: String(c.relation || 'Близкий человек').slice(0, 40) }));
    next.history = (Array.isArray(parsed.history) ? parsed.history : []).filter(e => e && typeof e.id === 'string' && Number.isFinite(e.createdAt)).slice(0, 50);
    const e = parsed.emergency;
    if (e && typeof e.id === 'string' && ['countdown', 'active'].includes(e.status) && Number.isFinite(e.createdAt) && Number.isFinite(e.deadline) && typeof e.test === 'boolean' && Date.now() - e.createdAt < 86400000 && e.deadline - e.createdAt <= 65000 && (e.stageMs === undefined || (Number.isFinite(e.stageMs) && e.stageMs >= 5000 && e.stageMs <= 30000)) && e.deadline >= e.createdAt) next.emergency = e;
    const hasData = next.onboarded || next.contacts.length || next.history.length || next.emergency || Object.values(next.profile).some(Boolean);
    next.retention = hasData ? validPeriod(parsed.retention, now) ? parsed.retention : registrationPeriod(now) : null;
    next.audioConsent = parsed.audioConsent?.version === 1 && Number.isFinite(parsed.audioConsent.grantedAt) && parsed.audioConsent.grantedAt <= now + 5000 ? parsed.audioConsent : null;
    next.pendingAudioPurge = parsed.pendingAudioPurge === true;
    if (!hasAudioConsent(next)) next.settings.recordAudio = false;
    if (profileExpiry(next.retention, now).expired && !next.emergency) {
      const cleared = { ...emptyStore(), pendingAudioPurge: true }; storage.setItem(KEY, JSON.stringify(cleared)); storage.removeItem('pesafe.v1'); return cleared;
    }
    storage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch { return emptyStore(); }
}
export function saveStore(state, storage = localStorage) {
  if (!state.retention && (state.onboarded || state.contacts.length || state.history.length || state.emergency || Object.values(state.profile).some(Boolean))) state.retention = registrationPeriod();
  storage.setItem(KEY, JSON.stringify(state));
}
export function deleteStore(storage = localStorage) { storage.removeItem(KEY); storage.removeItem('pesafe.v1'); }

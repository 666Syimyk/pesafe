export const DAY = 86400000;
export const ORDINARY_AUDIO_TTL = DAY;
export const SOS_AUDIO_TTL = 30 * DAY;
export const PROFILE_WARNING_DAYS = 30;
export const AUDIO_CONSENT_VERSION = 1;
export function registrationPeriod(now = Date.now(), id = crypto.randomUUID()) {
  const date = new Date(now); date.setUTCFullYear(date.getUTCFullYear() + 1);
  return { id, registeredAt: now, expiresAt: date.getTime() };
}
export function validPeriod(value, now = Date.now()) {
  return value && typeof value.id === 'string' && Number.isFinite(value.registeredAt) && value.registeredAt <= now + 5000 && Number.isFinite(value.expiresAt) && value.expiresAt > value.registeredAt && value.expiresAt - value.registeredAt <= 367 * DAY;
}
export function profileExpiry(period, now = Date.now()) {
  if (!period) return { expired: false, warning: false, daysLeft: null };
  const daysLeft = Math.max(0, Math.ceil((period.expiresAt - now) / DAY));
  return { expired: now >= period.expiresAt, warning: daysLeft <= PROFILE_WARNING_DAYS, daysLeft };
}
export const hasAudioConsent = state => state.audioConsent?.version === AUDIO_CONSENT_VERSION && Number.isFinite(state.audioConsent?.grantedAt);
export function audioExpiry({ kind, createdAt, activatedAt, profileExpiresAt }) {
  const deadline = kind === 'sos' ? (activatedAt || createdAt) + SOS_AUDIO_TTL : createdAt + ORDINARY_AUDIO_TTL;
  return Math.min(deadline, Number.isFinite(profileExpiresAt) ? profileExpiresAt : Infinity);
}

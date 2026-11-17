export const REASONS = { manual: 'Ручной SOS', sound: 'Резкий громкий звук', motion: 'Сильная тряска телефона', voice: 'Голосовая команда', test: 'Учебная тревога' };
import { runtimeConfig } from './runtime-config.js';
export const EMERGENCY_CALL = Object.freeze(runtimeConfig.emergencyCall || { number: '112', displayNumber: '112', temporary: false });
export const DEFAULTS = { countdown: 10, sound: true, motion: true, voice: false, threshold: 88, shareMedical: false, autoDelivery: false, recordAudio: false, doubleCheck: true, alertSounds: true };
export const EMPTY_PROFILE = { firstName: '', lastName: '', patronymic: '', phone: '', birthDate: '', address: '', blood: '', conditions: '', allergies: '', medication: '' };
export const normalizePhone = value => '+' + String(value).replace(/\D/g, '');
export const validPhone = value => /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));
export const fullName = profile => [profile.lastName, profile.firstName, profile.patronymic].filter(Boolean).join(' ');
export function ageOf(birthDate, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return null;
  const date = new Date(birthDate + 'T00:00:00');
  const [year, month, day] = birthDate.split('-').map(Number);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
  let age = now.getFullYear() - date.getFullYear();
  if (now.getMonth() < date.getMonth() || (now.getMonth() === date.getMonth() && now.getDate() < date.getDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}
export function profileErrors(profile) {
  const errors = {};
  if (!profile.firstName?.trim()) errors.firstName = 'Укажите имя';
  if (!profile.lastName?.trim()) errors.lastName = 'Укажите фамилию';
  if (!validPhone(profile.phone)) errors.phone = 'Нужен номер в международном формате';
  if (ageOf(profile.birthDate) === null) errors.birthDate = 'Проверьте дату рождения';
  if (!profile.address?.trim()) errors.address = 'Укажите адрес проживания';
  return errors;
}
export function freshLocation(location, now = Date.now()) {
  return location && Number.isFinite(location.lat) && Math.abs(location.lat) <= 90 && Number.isFinite(location.lng) && Math.abs(location.lng) <= 180 && Number.isFinite(location.accuracy) && location.accuracy >= 0 && Number.isFinite(location.timestamp) && now >= location.timestamp - 5000 && now - location.timestamp < 120000 ? location : null;
}
export const mapsUrl = loc => `https://www.google.com/maps?q=${loc.lat.toFixed(6)},${loc.lng.toFixed(6)}`;
export function buildMessage({ profile, location, reason, settings, test = false, now = Date.now() }) {
  const loc = freshLocation(location, now);
  const lines = [test ? 'УЧЕБНАЯ ТРЕВОГА PeSafe. Помощь не требуется.' : 'SOS · PeSafe. Мне нужна помощь.', `Имя: ${fullName(profile) || 'Не указано'}`, `Событие: ${REASONS[reason] || REASONS.manual}. Это сигнал пользователя/датчика, обстоятельства не подтверждены.`];
  if (profile.phone) lines.push(`Телефон: ${profile.phone}`);
  lines.push(loc ? `Местоположение: ${mapsUrl(loc)}\nТочность: ±${Math.round(loc.accuracy)} м. Получено: ${new Date(loc.timestamp).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek' })} (Бишкек).` : 'Текущее местоположение недоступно.');
  if (profile.address) lines.push(`Адрес проживания (не место происшествия): ${profile.address}`);
  if (settings.shareMedical) {
    const age = ageOf(profile.birthDate, new Date(now));
    if (age !== null) lines.push(`Возраст: ${age}`);
    for (const [key, label] of [['blood', 'Группа крови (со слов пользователя)'], ['conditions', 'Заболевания'], ['allergies', 'Аллергии'], ['medication', 'Препараты']]) if (profile[key]) lines.push(`${label}: ${profile[key]}`);
  }
  if (!test) lines.push(EMERGENCY_CALL.temporary ? `Временный тестовый номер для звонка: ${EMERGENCY_CALL.displayNumber}. Приложение не вызывает службы.` : 'Если не удаётся со мной связаться — позвоните 112 и сообщите это местоположение.');
  if (!test && settings.recordAudio) lines.push('Голосовая запись с места может прийти отдельным сообщением.');
  lines.push(`Время: ${new Date(now).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek' })} (Бишкек).`);
  return lines.join('\n');
}
// Текст, который пользователь или очевидец зачитывает диспетчеру 112 по телефону.
// Автоматической передачи в 112/МЧС нет: публичного API у службы нет.
export function dispatcherScript({ profile, location, reason, settings, now = Date.now() }) {
  const loc = freshLocation(location, now);
  const age = settings.shareMedical ? ageOf(profile.birthDate, new Date(now)) : null;
  const lines = ['Экстренный случай. Сигнал из приложения PeSafe.', `Человек: ${fullName(profile) || 'имя не указано'}${age !== null ? `, ${age} лет` : ''}.`, `Что произошло: ${REASONS[reason] || REASONS.manual}. Обстоятельства не подтверждены.`];
  lines.push(loc ? `Координаты: ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)} (точность ±${Math.round(loc.accuracy)} м).` : 'Координаты неизвестны — назовите адрес или ориентиры рядом.');
  if (profile.phone) lines.push(`Телефон: ${profile.phone}.`);
  if (profile.address) lines.push(`Адрес проживания (не место происшествия): ${profile.address}.`);
  if (settings.shareMedical) for (const [key, label] of [['blood', 'Группа крови'], ['conditions', 'Заболевания'], ['allergies', 'Аллергии'], ['medication', 'Препараты']]) if (profile[key]) lines.push(`${label}: ${profile[key]}.`);
  return lines.join('\n');
}
export function smsUrl(contacts, message, ios = false) {
  return `sms:${contacts.map(c => normalizePhone(c.phone)).join(',')}${ios ? '&' : '?'}body=${encodeURIComponent(message)}`;
}

export const PAUSE_MS = 5000;
// Единственный источник состояния тревоги. Deadline не зависит от частоты UI-таймера.
export class EmergencyMachine {
  constructor({ now = () => Date.now(), onChange = () => {}, restored = null } = {}) {
    this.now = now; this.onChange = onChange;
    this.value = restored && ['countdown', 'active'].includes(restored.status) ? restored : { status: 'idle' };
  }
  emit() { this.onChange({ ...this.value }); return this.value; }
  // twice=true: два предупреждения подряд (защита от ложных вызовов):
  // 1-й отсчёт → пауза PAUSE_MS → 2-й отсчёт → SOS. Отмена возможна на любом этапе.
  start(reason = 'manual', seconds = 10, test = false, twice = false) {
    if (['countdown', 'active'].includes(this.value.status)) return false;
    const ms = Math.max(5, Math.min(30, seconds)) * 1000; const at = this.now();
    this.value = { id: crypto.randomUUID(), status: 'countdown', reason, test, createdAt: at, deadline: at + (twice ? ms * 2 + PAUSE_MS : ms), ...(twice ? { stageMs: ms } : {}) };
    this.emit(); return true;
  }
  // 'first' | 'pause' | 'second' — для двойного предупреждения; 'single' — для обычного.
  phase() {
    const v = this.value; if (!v.stageMs) return 'single';
    const t = this.now() - v.createdAt;
    return t < v.stageMs ? 'first' : t < v.stageMs + PAUSE_MS ? 'pause' : 'second';
  }
  // Секунды до конца текущего этапа.
  remaining() {
    const v = this.value; const phase = this.phase();
    const end = phase === 'first' ? v.createdAt + v.stageMs : phase === 'pause' ? v.createdAt + v.stageMs + PAUSE_MS : v.deadline;
    return Math.max(0, Math.ceil((end - this.now()) / 1000));
  }
  tick() { if (this.value.status === 'countdown' && this.now() >= this.value.deadline) this.activate(); }
  activate() {
    if (this.value.status !== 'countdown') return false;
    this.value = { ...this.value, status: 'active', activatedAt: this.now() }; this.emit(); return true;
  }
  cancel() {
    if (this.value.status !== 'countdown') return false;
    this.value = { ...this.value, status: 'cancelled', endedAt: this.now() }; this.emit(); return true;
  }
  finish() {
    if (this.value.status !== 'active') return false;
    this.value = { ...this.value, status: 'resolved', endedAt: this.now() }; this.emit(); return true;
  }
}

export class SignalGate {
  constructor() { this.reset(); }
  reset() { this.loudSince = null; this.lastMotion = 0; this.motionHits = 0; this.cooldown = 0; }
  suppress(now = Date.now()) { this.loudSince = null; this.motionHits = 0; this.cooldown = now + 30000; }
  sound(level, threshold, now) {
    if (now < this.cooldown) return false;
    if (level < threshold) { this.loudSince = null; return false; }
    this.loudSince ??= now;
    if (now - this.loudSince >= 250) { this.suppress(now); return true; }
    return false;
  }
  motion(magnitude, now) {
    if (now < this.cooldown || magnitude < 24) return false;
    if (now - this.lastMotion < 120) return false;
    this.motionHits = now - this.lastMotion > 1200 ? 1 : this.motionHits + 1; this.lastMotion = now;
    if (this.motionHits >= 3) { this.suppress(now); return true; }
    return false;
  }
}

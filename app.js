import { DEFAULTS, REASONS, EMERGENCY_CALL, fullName, normalizePhone, validPhone, profileErrors, ageOf, freshLocation, mapsUrl, buildMessage, dispatcherScript, smsUrl, EmergencyMachine } from './core.js';
import { loadStore, saveStore, deleteStore } from './storage.js';
import { Sensors } from './sensors.js';
import { SosRecorder, RECORD_SECONDS } from './recorder.js';
import { runtimeConfig } from './runtime-config.js';
import { createPrivacy } from './privacy.js';
import { CallCoordinator, CALL_STATES } from './calls.js';
import { CountdownAudio } from './countdown-audio.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const paths = {
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/><circle cx="9" cy="7" r="4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M5 12h4l2-4 2 8 2-4h4"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.4 7M3 4v7h7m2-4v5l3 2"/>',
  settings: '<path d="m9 3-.6 3-2 .9-2.7-.9L1 10l2.1 2L3 14.2l-1 2.7L6 20l2.7-1 2 .8L12 23l4-1 .6-3 2-.9 2.7.9 2.7-4-2.1-2 .1-2.2 1-2.7L19 5l-2.7 1-2-.8L13 2Z" transform="translate(1 0) scale(.9)"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', chevron: '<path d="m9 5 7 7-7 7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .4c0 1.6-2.5 2-2.5 3.6m0 3h.01"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8"/>',
  motion: '<rect x="8" y="3" width="10" height="18" rx="2" transform="rotate(15 13 12)"/><path d="m4 4-2 4 2 4m17 1 2 4-2 4"/>',
  voice: '<path d="M4 10v4m4-8v12m4-16v20m4-16v12m4-8v4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="m7 3 3 5-2 2a15 15 0 0 0 6 6l2-2 5 3v3a2 2 0 0 1-2 2A19 19 0 0 1 2 5a2 2 0 0 1 2-2h3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  activity: '<path d="M2 12h5l3-9 4 18 3-9h5"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>', send: '<path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13"/>',
  book: '<path d="M12 5C8 2 3 3 2 4v16c4-2 8-1 10 1 2-2 6-3 10-1V4c-3-1-7-1-10 1Zm0 0v16"/>', logout: '<path d="M9 3H3v18h6m5-14 5 5-5 5m-7-5h14"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shield}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
document.querySelectorAll('[data-emergency-call]').forEach(el => { el.href = `tel:${EMERGENCY_CALL.number}`; el.textContent = EMERGENCY_CALL.displayNumber; });
let state = loadStore();
let privacy;
let page = ['home', 'contacts', 'profile', 'history', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
let monitor = false, paused = false, startingMonitor = false, lastLocation = null, locationState = 'idle', locationPromise = null, health = null, currentMessage = '', submitting = false, onboardingStep = 0, draft = null, wakeLock = null;
const statuses = { sound: 'off', motion: 'off', voice: 'off' };
const pageNames = { home: 'Обзор', contacts: 'Мои близкие', profile: 'Медкарта', history: 'История событий', settings: 'Настройки' };
const navIcons = { home: 'home', contacts: 'people', profile: 'heart', history: 'history', settings: 'settings' };
const dateFormat = value => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bishkek' });
function persist() { try { saveStore(state); return true; } catch { toast('Не удалось сохранить данные. Проверьте свободное место и настройки браузера.', 6000); return false; } }
function toast(message, duration = 3500) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, duration); }
function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'Я'; }
const complete = () => state.onboarded && Object.keys(profileErrors(state.profile)).length === 0 && state.contacts.length > 0;
const badge = (label, tone = '') => `<span class="badge ${tone}"><i></i>${esc(label)}</span>`;
const button = (label, action, cls = 'button', attrs = '') => `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const empty = (symbol, title, text, action = '') => `<div class="empty-state"><span class="empty-symbol">${icon(symbol)}</span><h3>${title}</h3><p>${text}</p>${action}</div>`;
const countdownAudio = new CountdownAudio({ onStatus: () => updateCountdownSoundControls() });
function updateCountdownSoundControls() {
  const status = $('countdownSoundStatus'), toggle = $('countdownSoundToggle');
  const enabled = state.settings.alertSounds;
  if (status) status.textContent = !enabled ? 'Тихий режим: звуки отсчёта выключены' : countdownAudio.status === 'ready' ? 'Звуковые сигналы включены' : countdownAudio.status === 'unavailable' ? 'Звук недоступен в этом браузере' : 'Для звука коснитесь «Включить звук»';
  if (toggle) { toggle.textContent = enabled && countdownAudio.status === 'ready' ? 'Выключить звук' : 'Включить звук'; toggle.setAttribute('aria-pressed', String(enabled && countdownAudio.status === 'ready')); }
}
function navigation() {
  const item = (key, label, mobile) => `<button data-action="nav" data-page="${key}" class="nav-item ${page === key ? 'selected' : ''}" ${page === key ? 'aria-current="page"' : ''} ${mobile ? `aria-label="${pageNames[key]}"` : ''}>${icon(navIcons[key])}<span>${label}</span>${key === 'contacts' ? `<small>${state.contacts.length}</small>` : ''}</button>`;
  document.querySelector('.side-nav').innerHTML = Object.keys(pageNames).map(key => item(key, pageNames[key], false)).join('');
  // На телефоне — короткие подписи в одну строку.
  const short = { home: 'Обзор', contacts: 'Близкие', profile: 'Медкарта', history: 'История', settings: 'Настройки' };
  document.querySelector('.mobile-nav').innerHTML = Object.keys(pageNames).map(key => item(key, short[key], true)).join('');
  $('pageLabel').textContent = pageNames[page];
  $('sidebarName').textContent = state.profile.firstName || 'Ваш профиль'; $('sidebarAvatar').textContent = initials(fullName(state.profile));
  network();
}
function network() { $('network').classList.toggle('offline', !navigator.onLine); $('network').innerHTML = `<i></i>${navigator.onLine ? 'В сети' : 'Без интернета'}`; }
function heading(eyebrow, title, text, action = '') { return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${text}</p></div>${action}</div>`; }
function contactMini(c, index) { return `<div class="contact-mini"><span class="avatar color-${index % 4}">${esc(initials(c.name))}</span><span><b>${esc(c.name)}</b><small>${esc(c.relation)}</small></span><a class="icon-button" href="tel:${esc(c.phone)}" aria-label="Позвонить: ${esc(c.name)}">${icon('phone')}</a></div>`; }
function homeView() {
  const ready = complete();
  return `${heading('ВАША БЕЗОПАСНОСТЬ — ПОД РУКОЙ', `${state.profile.firstName ? `Здравствуйте, ${esc(state.profile.firstName)}` : 'Хорошо, когда помощь рядом'}<span class="heading-dot">.</span>`, 'Для вас и тех, кто вам дорог.', `<span class="date-label">${icon('clock')}${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Bishkek' })}</span>`)}
  ${!ready ? `<div class="setup-banner"><span class="soft-icon">${icon('shield')}</span><div><b>Давайте подготовим вашу защиту</b><p>Заполните профиль и добавьте близкого человека.</p></div>${button(`Настроить ${icon('arrow')}`, 'onboard', 'button button-dark small-button')}</div>` : ''}
  <div class="dashboard-grid">
    <section class="card sos-card"><div class="card-top"><span class="section-kicker">ЭКСТРЕННАЯ ПОМОЩЬ</span>${badge('Готова по нажатию')}</div><h2>Одна кнопка.<br>Самое важное — рядом.</h2><p class="sos-description">Начните SOS, если вам или кому-то<br class="desktop-break"> рядом нужна помощь.</p><div class="sos-orbit"><div class="orbit-dot dot-one"></div><div class="orbit-dot dot-two"></div><button class="sos-button" data-action="sos" aria-label="SOS — начать отсчёт тревоги"><span>${icon('activity')}</span><b>SOS</b><small>НУЖНА ПОМОЩЬ</small></button></div><div class="sos-hint">${icon('clock')} ${state.settings.doubleCheck ? `2 предупреждения по ${state.settings.countdown} с — можно отменить` : `${state.settings.countdown} секунд, чтобы отменить тревогу`}</div><div class="sos-bottom"><span>${icon('lock')} Вы управляете отправкой</span><button data-action="preview" class="text-button">Что получат близкие? ${icon('arrow')}</button></div></section>
    <section class="card protection-card"><div class="card-top"><h2>${icon('shield')} Умная защита</h2><label class="switch"><input id="monitorToggle" type="checkbox" aria-label="Включить мониторинг" ${monitor ? 'checked' : ''} ${startingMonitor ? 'disabled' : ''}><span></span></label></div><div class="protection-state" id="protectionState">${monitor ? 'Мониторинг включён' : paused ? 'Мониторинг приостановлен' : 'Спокойствие начинается с готовности'}</div><p class="card-description">Датчики заметят подозрительный сигнал и предложат запустить SOS.</p><div class="sensor-list">${sensorRow('sound', 'mic', 'Звуки вокруг', 'Резкие громкие звуки')}${sensorRow('motion', 'motion', 'Движение телефона', 'Сильная повторная тряска')}${sensorRow('voice', 'voice', 'Голосовая команда', '«Мне нужна помощь»')}</div><div class="monitor-note">${icon('info')}<span>В этой версии — при открытом приложении. Фоновый режим не поддерживается.</span></div>${button(`Проверить сценарий ${icon('arrow')}`, 'test', 'button button-soft full-width')}</section>
    <section class="card location-card"><div class="card-top"><h2>${icon('pin')} Ваше местоположение</h2><span id="locationBadge">${badge(locationState === 'success' && freshLocation(lastLocation) ? 'GPS получен' : 'Нужно разрешение', locationState === 'success' && freshLocation(lastLocation) ? 'green' : 'neutral')}</span></div><div class="map-preview"><svg viewBox="0 0 700 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="700" height="230" fill="#edf0e9"/><g fill="#e1e7d9"><rect x="35" y="18" width="95" height="70" rx="8"/><rect x="150" y="18" width="96" height="70" rx="8"/><rect x="35" y="110" width="210" height="100" rx="9"/><rect x="390" y="20" width="110" height="78" rx="8"/><rect x="520" y="20" width="150" height="78" rx="8"/><rect x="470" y="130" width="200" height="80" rx="8"/></g><path d="M-20 120 160 120 300 80 420 145 710 145" fill="none" stroke="#fff" stroke-width="15"/><path d="m300-10 0 250M-10 100h720M420-10v260" fill="none" stroke="#fff" stroke-width="11"/><path d="M-10 200Q180 160 240 230M560-10Q490 100 540 250" fill="none" stroke="#cce3e4" stroke-width="20"/><circle cx="343" cy="109" r="38" fill="#e9595215"/><circle cx="343" cy="109" r="24" fill="#e9595220"/><circle cx="343" cy="109" r="10" fill="#ec625c" stroke="#fff" stroke-width="4"/></svg><span class="map-label">Схема · не для навигации</span><div class="map-info"><span class="pin-circle">${icon('pin')}</span><div><b id="locationTitle">${freshLocation(lastLocation) ? `${lastLocation.lat.toFixed(5)}, ${lastLocation.lng.toFixed(5)}` : 'Где вы сейчас?'}</b><small id="locationDetail">${freshLocation(lastLocation) ? `Точность ±${Math.round(lastLocation.accuracy)} м · ${dateFormat(lastLocation.timestamp)}` : 'Разрешите GPS, чтобы добавить координаты к SOS'}</small></div><button class="icon-button" data-action="locate" aria-label="Обновить местоположение">${icon('pin')}</button></div></div></section>
    <section class="card close-card"><div class="card-top"><h2>Ваш круг поддержки</h2><button class="text-button" data-action="nav" data-page="contacts">Все ${icon('arrow')}</button></div>${state.contacts.length ? `<div class="mini-contacts">${state.contacts.slice(0, 2).map(contactMini).join('')}</div>` : `<div class="mini-empty">${icon('people')}<span>Добавьте тех, кому доверяете.<br>Вместе спокойнее.</span></div>`}<button class="add-contact-dashed" data-action="add-contact">${icon('plus')} Добавить близкого</button></section>
  </div><div class="bottom-strip"><span class="strip-icon">${icon('book')}</span><div><b>Подготовьтесь сейчас. Это займёт минуту.</b><p>Проверьте контакты, медицинскую карточку и сценарий тревоги.</p></div><button class="text-button" data-action="help">Как работает PeSafe ${icon('arrow')}</button></div>`;
}
function sensorRow(key, symbol, title, subtitle) { return `<div class="sensor-row"><span class="sensor-icon">${icon(symbol)}</span><div><b>${title}</b><small>${subtitle}</small></div><span class="sensor-state" id="sensor-${key}"></span></div>`; }
const statusText = { off: 'Выключено', active: 'Работает', waiting: 'Ждём данные', denied: 'Нет доступа', unsupported: 'Недоступно', error: 'Ошибка', paused: 'Пауза' };
function renderSensorStatuses() {
  for (const key of Object.keys(statuses)) {
    const el = $(`sensor-${key}`); if (!el) continue;
    const status = state.settings[key] ? statuses[key] : 'off';
    const text = monitor ? statusText[status] : state.settings[key] ? 'Готов к запуску' : 'Выключено';
    el.textContent = text; el.className = 'sensor-state ' + (monitor && status === 'active' ? 'is-active' : '');
  }
}
function contactsView() { return `${heading('ВАШ КРУГ ПОДДЕРЖКИ', 'Мои близкие', 'Те, к кому можно обратиться, когда это особенно нужно.', button(`${icon('plus')} Добавить близкого`, 'add-contact', 'button button-dark'))}<div class="info-banner">${icon('info')}<p>SMS открывается с готовым текстом — отправку подтверждаете вы. Получатели автоматического Telegram-канала настраиваются отдельно на сервере.</p></div><div class="contacts-grid">${state.contacts.map((c, i) => `<article class="card person-card"><div class="person-top"><span class="avatar large-avatar color-${i % 4}">${esc(initials(c.name))}</span><button class="icon-button" data-action="edit-contact" data-id="${esc(c.id)}" aria-label="Редактировать: ${esc(c.name)}">${icon('settings')}</button></div><h2>${esc(c.name)}</h2><p>${esc(c.relation)} ${i === 0 ? '<span class="priority-label">Основной контакт</span>' : ''}</p><a class="person-phone" href="tel:${esc(c.phone)}">${icon('phone')}${esc(c.phone)}</a><div class="person-actions">${i > 0 ? button('Сделать основным', 'prioritize-contact', 'text-button', `data-id="${esc(c.id)}"`) : '<span class="muted small-text">Первый для быстрого звонка</span>'}${button(icon('trash'), 'remove-contact', 'icon-button danger-text', `data-id="${esc(c.id)}" aria-label="Удалить: ${esc(c.name)}"`)}</div></article>`).join('')}${!state.contacts.length ? `<div class="card full-span">${empty('people', 'Ваши люди будут здесь', 'Добавьте хотя бы одного близкого человека. Убедитесь, что он согласен получать тревожные сообщения.', button('Добавить контакт', 'add-contact', 'button button-dark'))}</div>` : ''}</div><div class="section-note">${icon('lock')} До 10 контактов. Номера сохраняются только на этом устройстве.</div>`; }
function field(name, label, value = '', attrs = '', type = 'text', required = false) { return `<label class="field"><span>${label}${required ? ' <em>*</em>' : ''}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs} ${required ? 'required' : ''}></label>`; }
function personalFields(profile) { return `<div class="form-grid">${field('lastName', 'Фамилия', profile.lastName, 'autocomplete="family-name" maxlength="60"', 'text', true)}${field('firstName', 'Имя', profile.firstName, 'autocomplete="given-name" maxlength="60"', 'text', true)}${field('patronymic', 'Отчество', profile.patronymic, 'autocomplete="additional-name" maxlength="60"')}${field('birthDate', 'Дата рождения', profile.birthDate, `max="${new Date().toISOString().slice(0, 10)}" min="1906-01-01"`, 'date', true)}${field('phone', 'Ваш телефон', profile.phone, 'autocomplete="tel" placeholder="+996 555 123 456" maxlength="22"', 'tel', true)}${field('address', 'Адрес проживания', profile.address, 'autocomplete="street-address" maxlength="180" placeholder="Город, улица, дом"', 'text', true)}</div>`; }
function medicalFields(profile) { return `<div class="form-grid"><label class="field"><span>Группа крови</span><select name="blood">${['', 'O (I) Rh+', 'O (I) Rh−', 'A (II) Rh+', 'A (II) Rh−', 'B (III) Rh+', 'B (III) Rh−', 'AB (IV) Rh+', 'AB (IV) Rh−'].map(v => `<option value="${v}" ${profile.blood === v ? 'selected' : ''}>${v || 'Не знаю / не указывать'}</option>`).join('')}</select></label>${field('allergies', 'Аллергии', profile.allergies, 'maxlength="400" placeholder="На лекарства, продукты…"')}${field('conditions', 'Важные заболевания', profile.conditions, 'maxlength="400" placeholder="То, что нужно знать при оказании помощи"')}${field('medication', 'Принимаемые препараты', profile.medication, 'maxlength="400" placeholder="Название и дозировка, если знаете"')}</div>`; }
function profileView() { return `${heading('ИНФОРМАЦИЯ, КОТОРАЯ МОЖЕТ ПОМОЧЬ', 'Медицинская карточка', 'Заполните заранее, чтобы важное было под рукой.')}<div class="profile-layout"><form id="profileForm" class="card form-card"><div class="section-heading"><span class="soft-icon">${icon('people')}</span><div><h2>Личные данные</h2><p>Обязательные поля отмечены звёздочкой</p></div></div>${personalFields(state.profile)}<hr><div class="section-heading"><span class="soft-icon pink">${icon('heart')}</span><div><h2>О здоровье</h2><p>По желанию. Информация со слов пользователя.</p></div></div>${medicalFields(state.profile)}<div class="form-error" role="alert" id="profileError"></div><div class="form-footer"><span>${icon('lock')} Хранится на устройстве</span><button class="button button-dark" type="submit">Сохранить изменения ${icon('check')}</button></div></form><aside class="card profile-summary"><div class="medical-mark">${icon('heart')}</div><span class="eyebrow">КАРТОЧКА PESAFE</span><h2>${esc(fullName(state.profile)) || 'Ваше имя'}</h2><p>${ageOf(state.profile.birthDate) !== null ? `Возраст: ${ageOf(state.profile.birthDate)} · ` : ''}Кыргызстан</p><div class="summary-divider"></div><span class="small-label">ЭКСТРЕННЫЙ КОНТАКТ</span><b>${esc(state.contacts[0]?.name || 'Не добавлен')}</b><span>${esc(state.contacts[0]?.phone || 'Добавьте близкого во вкладке «Мои близкие»')}</span><div class="summary-note">${icon('info')} Медицинские сведения включаются в SOS только с вашего разрешения в настройках.</div></aside></div>`; }
function historyView() { return `${heading('ВСЁ ПОД КОНТРОЛЕМ', 'История событий', 'Учебные проверки и реальные тревоги. Время Бишкека.', state.history.length ? button(`${icon('trash')} Очистить историю`, 'clear-history', 'button button-outline') : '')}<section class="card history-card">${state.history.length ? `<div class="history-table">${state.history.map(e => `<div class="history-row"><span class="event-icon ${e.test ? 'test-event' : e.status === 'cancelled' ? 'safe-event' : ''}">${icon(e.test ? 'shield' : e.status === 'cancelled' ? 'check' : 'bell')}</span><div><b>${esc(REASONS[e.reason] || 'SOS')}${e.test ? ' · тест' : ''}</b><small>${dateFormat(e.createdAt)}</small></div><div class="history-status">${badge(e.status === 'cancelled' ? 'Отменено' : e.status === 'resolved' ? 'Завершено' : e.status === 'countdown' ? 'Отсчёт' : 'SOS активен', e.status === 'cancelled' ? 'green' : 'neutral')}<small>${esc(deliveryLabel(e.delivery))}</small></div></div>`).join('')}</div>` : empty('history', 'Пусть здесь будут только проверки', 'Пока событий нет. Пройдите безопасный тест: он не отправляет сообщения и не совершает звонки.', button('Проверить сценарий', 'test', 'button button-dark'))}</section><p class="section-note">${icon('lock')} Последние 50 событий хранятся на устройстве до удаления профиля. Голосовые файлы — в разделе ниже.</p>`; }
function settingToggle(key, title, text, symbol) { return `<label class="setting-row"><span class="soft-icon">${icon(symbol)}</span><span><b>${title}</b><small>${text}</small></span><span class="switch"><input type="checkbox" data-setting="${key}" ${state.settings[key] ? 'checked' : ''}><span></span></span></label>`; }
function settingsView() { return `${heading('НАСТРОЙТЕ ПОД СЕБЯ', 'Спокойствие в деталях', 'Понятные настройки. Никаких скрытых действий.')}<div class="settings-layout"><div class="settings-main"><section class="card settings-card"><div class="section-heading"><span class="soft-icon">${icon('shield')}</span><div><h2>Обнаружение сигналов</h2><p>Эвристики датчиков, без подтверждённого распознавания ДТП</p></div></div>${settingToggle('sound', 'Резкие звуки', 'Громкость выше порога не менее 250 мс. Аудио не записывается.', 'mic')}${settingToggle('motion', 'Тряска телефона', 'Три сильных ускорения. Может сработать от обычного движения.', 'motion')}${settingToggle('voice', 'Голосовая команда', 'Разрешаю распознавание речи браузером. Аудио может передаваться его провайдеру.', 'voice')}<div class="range-setting"><label for="threshold">Порог громкости <b id="thresholdValue">${state.settings.threshold}</b></label><input id="threshold" type="range" min="65" max="99" value="${state.settings.threshold}" data-setting="threshold"><div class="range-labels"><span>Чувствительнее</span><span>Меньше срабатываний</span></div></div></section><section class="card settings-card"><div class="section-heading"><span class="soft-icon pink">${icon('clock')}</span><div><h2>Сценарий SOS</h2><p>Вы всегда можете отменить отсчёт одним нажатием</p></div></div><label class="setting-select"><span><b>Время на отмену</b><small>После сигнала датчика или кнопки SOS</small></span><select data-setting="countdown" aria-label="Время на отмену">${[5, 10, 15, 20, 30].map(v => `<option value="${v}" ${state.settings.countdown === v ? 'selected' : ''}>${v} секунд</option>`).join('')}</select></label>${settingToggle('alertSounds', 'Звуки отсчёта', 'Короткие сигналы во время таймера, более настойчивые перед SOS. Громкость зависит от телефона.', 'bell')}${settingToggle('doubleCheck', 'Двойное предупреждение', 'Защита от ложных вызовов: отсчёт → пауза 5 с → второй отсчёт → SOS. Кнопка «Нужна помощь сейчас» срабатывает сразу.', 'bell')}${settingToggle('shareMedical', 'Включать медкарту в сообщение', 'Разрешаю включать возраст и сведения о здоровье в SOS близким.', 'heart')}${settingToggle('autoDelivery', 'Автоотправка близким', 'После отсчёта — только через подключённый Telegram-канал.', 'send')}${settingToggle('recordAudio', 'Голосовая запись при SOS', `Разрешаю записывать до ${RECORD_SECONDS} секунд звука с начала тревоги. Перед записью нужно отдельное согласие. Запись активированного SOS хранится в браузере 30 дней, при отмене удаляется сразу. Её можно скачать; передача близким настраивается отдельно.`, 'mic')}</section><section class="card settings-card"><div class="section-heading"><span class="soft-icon">${icon('send')}</span><div><h2>Подключение Telegram</h2><p>Приватный сервер для одного пользователя / семьи</p></div></div><p class="card-description">Ключ подключения выдаёт владелец вашего сервера. Токен бота хранится только на сервере. Ключ подключения — в памяти текущей вкладки.</p><form id="channelForm"><label class="field"><span>Ключ подключения</span><input name="accessKey" type="password" autocomplete="off" minlength="32" maxlength="256" placeholder="Вставьте ключ сервера" required></label><div class="channel-controls"><button type="submit" class="button button-dark">Проверить подключение</button>${button('Отключить', 'disconnect', 'text-button')}</div></form><div class="channel-status" id="channelStatus">${health ? health.dryRun ? 'Учебный сервер: отправка отключена' : `Telegram: получателей ${health.recipients}. Прочтение не проверяется.` : 'Не подключено. Автоматической отправки пока нет.'}</div></section></div><aside><section class="card settings-aside"><span class="soft-icon">${icon('lock')}</span><h2>Ваши данные — ваш выбор</h2><p>Локальный профиль и медкарта не зашифрованы отдельно от хранилища браузера. Защитите телефон кодом.</p>${button(`${icon('download')} Экспорт моих данных`, 'export', 'button button-outline full-width')}${button(`${icon('trash')} Удалить все данные`, 'delete-data', 'text-button danger-text full-width')}<hr><h3>Установите PeSafe</h3><p>Android: меню браузера → «Установить приложение». iPhone: Safari → «Поделиться» → «На экран Домой».</p><p class="small-text">Установка PWA не включает фоновый мониторинг.</p></section></aside></div>`; }
function render() {
  navigation(); $('main').innerHTML = ({ home: homeView, contacts: contactsView, profile: profileView, history: historyView, settings: settingsView })[page](); renderSensorStatuses(); privacy?.mount();
}
function navigate(next) { if (!pageNames[next]) return; page = next; location.hash = next; render(); scrollTo({ top: 0, behavior: 'instant' }); }
function showDialog(html, cls = '') { const d = $('formDialog'); d.className = 'form-dialog ' + cls; $('dialogContent').innerHTML = html; if (!d.open) d.showModal(); const h = d.querySelector('h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
const dialogHeader = (title, subtitle = '') => `<div class="dialog-heading"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button" data-action="close-dialog" aria-label="Закрыть">${icon('close')}</button></div>`;
function showContact(id = null) {
  const c = state.contacts.find(c => c.id === id);
  if (!c && state.contacts.length >= 10) return toast('Можно добавить до 10 контактов');
  showDialog(`${dialogHeader(c ? 'Редактировать контакт' : 'Кто будет рядом?', 'Убедитесь, что человек согласен получать ваши SOS.')}<form id="contactForm" data-id="${esc(c?.id || '')}">${field('name', 'Имя близкого', c?.name, 'maxlength="60" placeholder="Например, Алина"', 'text', true)}${field('phone', 'Номер телефона', c?.phone, 'maxlength="22" placeholder="+996 555 123 456"', 'tel', true)}<label class="field"><span>Кем вам приходится</span><select name="relation">${['Близкий человек', 'Мама', 'Папа', 'Супруг / супруга', 'Друг / подруга', 'Коллега'].map(v => `<option ${v === c?.relation ? 'selected' : ''}>${v}</option>`).join('')}</select></label><p class="form-error" id="contactError" role="alert"></p><button class="button button-dark full-width" type="submit">${c ? 'Сохранить изменения' : 'Добавить близкого'} ${icon('check')}</button></form>`);
}
function onboarding(step = 0) {
  if (!draft) draft = { profile: { ...state.profile }, contact: {} };
  onboardingStep = step;
  const titles = ['Давайте познакомимся', 'Важное о вашем здоровье', 'Добавьте своего человека'];
  showDialog(`<div class="onboarding-layout"><div class="onboarding-art"><a class="brand" href="#home">${icon('shield')} PeSafe.</a><div class="onboarding-radar"><span>${icon('shield')}</span><i></i><i></i></div><h2>Рядом,<br>когда важно.</h2><p>Ваша безопасность начинается<br>с одного простого шага.</p><div class="onboarding-art-footer">${icon('lock')} Личное. Под вашим контролем.</div></div><div class="onboarding-form"><div class="onboarding-top"><span>ЗНАКОМСТВО · ${step + 1} ИЗ 3</span><button class="text-button" data-action="close-dialog" aria-label="Заполнить позже">Позже ${icon('close')}</button></div><div class="step-progress">${[0, 1, 2].map(i => `<span class="${i <= step ? 'done' : ''}"></span>`).join('')}</div><h2>${titles[step]}</h2><p class="card-description">${['Заполните данные заранее. Они помогут близким понять, кто нуждается в помощи.', 'Можно оставить поля пустыми. Вы сами решите, включать ли эти данные в SOS.', 'Ему можно быстро позвонить или подготовить SMS с координатами.'][step]}</p><form id="onboardForm">${step === 0 ? personalFields(draft.profile) : step === 1 ? medicalFields(draft.profile) : `${field('name', 'Имя близкого', '', 'maxlength="60" placeholder="Например, Мама"', 'text', !state.contacts.length)}${field('phone', 'Телефон близкого', '', 'maxlength="22" placeholder="+996 555 123 456"', 'tel', !state.contacts.length)}${state.contacts.length ? `<p class="card-description">Уже добавлено контактов: ${state.contacts.length}. Можно продолжить без нового.</p>` : ''}<label class="consent"><input name="consent" type="checkbox" required><span>Согласен хранить профиль и контакты на этом устройстве один год с предупреждением за 30 дней до удаления. Голос записывается только после отдельного согласия. Сообщил близкому о назначении приложения. Понимаю, что мониторинг работает при открытом приложении. Звонок на временный тестовый номер подтверждается в телефоне.</span></label>`}<p class="form-error" id="onboardError" role="alert"></p><div class="onboarding-actions">${step > 0 ? button('Назад', 'onboard-back', 'text-button') : '<span class="small-text muted">* Обязательные поля</span>'}<button class="button button-dark" type="submit">${step === 2 ? 'Завершить настройку' : step === 1 ? 'Далее / пропустить' : 'Продолжить'} ${icon('arrow')}</button></div></form></div></div>`, 'onboarding-dialog');
}
async function locate() {
  if (locationPromise) return locationPromise;
  if (!navigator.geolocation) { locationState = 'error'; updateLocationUI(); return null; }
  locationState = 'loading'; updateLocationUI();
  locationPromise = new Promise(resolve => navigator.geolocation.getCurrentPosition(position => {
    lastLocation = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp }; locationState = 'success'; resolve(lastLocation);
  }, () => { locationState = 'error'; resolve(null); }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 })).finally(() => { locationPromise = null; updateLocationUI(); });
  return locationPromise;
}
function updateLocationUI() {
  const loc = freshLocation(lastLocation);
  if ($('locationTitle')) $('locationTitle').textContent = locationState === 'loading' ? 'Определяем местоположение…' : loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : locationState === 'error' ? 'Местоположение недоступно' : 'Где вы сейчас?';
  if ($('locationDetail')) $('locationDetail').textContent = loc ? `Точность ±${Math.round(loc.accuracy)} м · ${dateFormat(loc.timestamp)}` : 'Разрешите GPS в настройках браузера';
  if ($('locationBadge')) $('locationBadge').innerHTML = badge(loc ? 'GPS получен' : locationState === 'loading' ? 'Поиск GPS' : 'GPS недоступен', loc ? 'green' : 'neutral');
}
const sensors = new Sensors({ signal: reason => { if (monitor) startEmergency(reason); }, status: (key, status) => { statuses[key] = status; renderSensorStatuses(); }, level: value => { if ($('soundLevel')) $('soundLevel').style.width = `${value}%`; } });
async function setMonitoring(on) {
  if (!on) { sensors.stop(); monitor = false; startingMonitor = false; releaseWakeLock(); render(); return; }
  if (!complete()) { toast('Сначала заполните профиль и добавьте контакт'); onboarding(); return; }
  if (!['sound', 'motion', 'voice'].some(key => state.settings[key])) { toast('Выберите хотя бы один датчик в настройках'); navigate('settings'); return; }
  if (state.settings.alertSounds) countdownAudio.unlock();
  paused = false; monitor = true; startingMonitor = true; render();
  await sensors.start(state.settings); startingMonitor = false;
  if (!monitor) return;
  if (Object.values(statuses).every(s => ['off', 'denied', 'unsupported', 'error'].includes(s))) { monitor = false; sensors.stop(); toast('Датчики недоступны. Ручной SOS продолжает работать.', 5000); }
  else { acquireWakeLock(); toast('Мониторинг включён. Оставьте приложение открытым.', 5000); }
  render();
}
async function acquireWakeLock() { try { if (!wakeLock && navigator.wakeLock && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); } catch {} }
function releaseWakeLock() { wakeLock?.release().catch(() => {}); wakeLock = null; }

function historyEntry(event) {
  let entry = state.history.find(e => e.id === event.id);
  if (!entry) { entry = { id: event.id, createdAt: event.createdAt, reason: event.reason, test: event.test, status: event.status, delivery: 'none' }; state.history.unshift(entry); state.history = state.history.slice(0, 50); }
  entry.status = event.status; if (event.endedAt) entry.endedAt = event.endedAt;
  return entry;
}
function createSOSRecorder() { const current = new SosRecorder({ onState: status => {
  if (current !== recorder) return;
  const event = machine.value;
  if (event.id && ['active', 'countdown'].includes(event.status) && !event.test && ['denied', 'unsupported', 'error'].includes(status)) setAudio(event.id, status);
  updateRecordingUI();
  if (status === 'ready') { if (current._sosEvent) privacy?.archiveSOS(current, current._sosEvent); uploadAudio(); }
} }); return current; }
let recorder = createSOSRecorder();
const audioLabels = { sending: 'Отправляется близким…', accepted: 'Запись принята Telegram', partial: 'Запись принята частично', simulated: 'Учебный сервер · запись не отправлена', failed: 'Запись не отправлена', unknown: 'Отправка записи не подтверждена', denied: 'Нет доступа к микрофону', unsupported: 'Запись не поддерживается', error: 'Ошибка записи' };
function recordingHtml() {
  const event = machine.value;
  if (event.test) return `${icon('mic')}<span>В учебном режиме запись не ведётся.</span>`;
  if (!state.settings.recordAudio) return `${icon('mic')}<span>Голосовая запись выключена в настройках.</span>`;
  const s = recorder.state;
  if (s === 'requesting') return `${icon('mic')}<span>Запрашиваем доступ к микрофону…</span>`;
  if (s === 'recording') return `<span class="rec-dot" aria-hidden="true"></span><span>Идёт запись звука · <b id="recElapsed">${recorder.elapsed()}</b> / ${RECORD_SECONDS} с</span>${event.status === 'active' ? button('Остановить', 'stop-recording', 'text-button rec-stop') : ''}`;
  if (s === 'denied') return `${icon('mic')}<span>Нет доступа к микрофону — запись не сделана.</span>`;
  if (s === 'unsupported') return `${icon('mic')}<span>Этот браузер не умеет записывать звук.</span>`;
  if (s === 'error') return `${icon('mic')}<span>Не удалось сделать запись.</span>`;
  if (s === 'ready') {
    const entry = state.history.find(e => e.id === event.id);
    const sent = audioLabels[entry?.audio] || 'Хранится только на этом телефоне';
    return `<div class="rec-ready"><div class="rec-head">${icon('mic')}<span><b>Запись готова · ${recorder.duration} с</b><small id="audioStatus">${esc(sent)}</small></span></div><audio controls preload="metadata" src="${recorder.url}"></audio>${button(`${icon('download')} Скачать запись`, 'download-audio', 'button button-outline full-width')}${button(`${icon('send')} Отправить запись`, 'share-audio', 'button button-outline full-width')}</div>`;
  }
  return `${icon('mic')}<span>Запись не велась${event.status === 'active' ? ' (страница была перезагружена)' : ''}.</span>`;
}
function updateRecordingUI() { const box = $('recordingBox'); if (box) { box.innerHTML = recordingHtml(); box.classList.toggle('is-recording', recorder.state === 'recording'); } }
function setAudio(id, status) {
  const entry = state.history.find(e => e.id === id); if (entry) entry.audio = status;
  persist(); if (recorder.state === 'ready' && $('audioStatus')) $('audioStatus').textContent = audioLabels[status] || status;
}
let audioSending = false;
async function uploadAudio() {
  const event = machine.value;
  if (audioSending || event.status !== 'active' || event.test || recorder.state !== 'ready' || recorder.eventId !== event.id) return;
  if (!state.settings.autoDelivery || !accessKey || !health || !navigator.onLine) return;
  const entry = state.history.find(e => e.id === event.id);
  // Сервер принимает запись только к уже принятой тревоге.
  if (!entry || !['accepted', 'partial', 'simulated'].includes(entry.delivery) || ['sending', 'accepted', 'partial', 'simulated'].includes(entry.audio)) return;
  audioSending = true; setAudio(event.id, 'sending');
  try {
    const response = await fetch(`${runtimeConfig.apiBase}/api/incidents/${event.id}/audio`, { method: 'POST', headers: { 'Content-Type': recorder.blob.type || 'audio/webm', Authorization: `Bearer ${accessKey}` }, body: recorder.blob, signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    setAudio(event.id, response.ok ? data.state : 'failed');
    if (!response.ok) toast(data.error || 'Сервер не принял запись. Отправьте её вручную.', 5000);
  } catch { setAudio(event.id, 'unknown'); toast('Нет подтверждения отправки записи. Отправьте её вручную.', 5000); }
  finally { audioSending = false; }
}
async function shareAudio() {
  const file = recorder.file(); if (!file) return;
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'SOS · голосовая запись PeSafe', text: currentMessage }); return; }
  } catch (err) { if (err.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = recorder.url; a.download = file.name; a.click();
  toast('Запись сохранена в загрузки. Её можно переслать в любом мессенджере.', 5000);
}
const calls = new CallCoordinator({ onUpdate: (id, fields) => {
  if (machine.value.id !== id || machine.value.status !== 'active') return false;
  Object.assign(machine.value, fields); state.emergency = { ...machine.value };
  const entry = state.history.find(entry => entry.id === id); if (entry) Object.assign(entry, fields);
  const stored = persist(); updateCallStatus(); return stored;
} });
function updateCallStatus() { const box = $('callStatus'); if (box) box.textContent = CALL_STATES[machine.value.callState] || 'Автоматический вызов не подтверждён. При необходимости используйте кнопку звонка.'; }
const machine = new EmergencyMachine({ restored: state.emergency, onChange: event => {
  if (event.status !== 'countdown') countdownAudio.stop();
  if (event.status === 'countdown') { event.callTarget = EMERGENCY_CALL.number; machine.value.callTarget = event.callTarget; }
  state.emergency = ['countdown', 'active'].includes(event.status) ? event : null; historyEntry(event); persist();
  if (event.status === 'countdown') { showEmergency(); if (!event.test) locate(); }
  if (event.status === 'active') { recorder._sosEvent = { ...event }; if (recorder.state === 'ready') privacy?.archiveSOS(recorder, event); showEmergency(); activateDelivery(event); calls.request(machine.value, EMERGENCY_CALL); }
  if (event.status === 'countdown' && !event.test && state.settings.recordAudio && privacy?.canRecord()) { recorder._profileId = state.retention?.id; recorder.start(event.id); }
  if (['cancelled', 'resolved'].includes(event.status)) {
    if (event.status === 'resolved' && !event.test) {
      const closing = recorder; recorder = createSOSRecorder();
      closing.stop().then(() => privacy?.archiveSOS(closing, event)).finally(() => closing.discard());
    } else recorder.discard();
    sensors.gate.suppress(); $('emergencyDialog').close(); releaseWakeLock(); currentMessage = ''; persist(); render();
    toast(event.status === 'cancelled' ? 'Тревога отменена. Рады, что вы в порядке.' : 'SOS завершён. Отправленные сообщения остаются у получателей.', 5000);
  }
} });
function startEmergency(reason = 'manual', test = false) {
  if (state.settings.alertSounds) countdownAudio.unlock();
  if ($('formDialog').open) $('formDialog').close();
  if (!machine.start(reason, state.settings.countdown, test, state.settings.doubleCheck)) return;
  if (!test) navigator.vibrate?.([200, 100, 200]); acquireWakeLock();
}
let shownPhase = null;
function countdownCopy(phase, test) {
  const steps = current => `<div class="stage-steps" aria-label="Этап ${current === 'second' ? 2 : 1} из 2">${[['first', '1'], ['second', '2'], ['sos', 'SOS']].map(([key, label], i) => `${i ? `<i class="${(current === 'second' && i === 1) ? 'done' : ''}"></i>` : ''}${(() => { const done = (current === 'second' || current === 'pause') && key === 'first'; return `<span class="${done ? 'done' : key === current ? 'current' : ''}">${done ? '✓' : label}</span>`; })()}`).join('')}</div>`;
  if (phase === 'first') return { title: 'Вам нужна помощь?', label: 'СЕКУНД ДО ПОВТОРНОЙ ПРОВЕРКИ', note: `Первое предупреждение. Если всё в порядке — отмените. ${test ? 'Это тест.' : 'После второго отсчёта будет автоматически запрошено открытие звонка.'}`, steps: steps('first') };
  if (phase === 'pause') return { title: 'Проверим ещё раз', label: 'СЕКУНД ДО ВТОРОГО ПРЕДУПРЕЖДЕНИЯ', note: 'Ответа нет. Сейчас будет последнее предупреждение — отменить можно и сейчас.', steps: steps('pause') };
  if (phase === 'second') return { title: 'Последнее предупреждение', label: 'СЕКУНД ДО SOS', note: null, steps: steps('second') };
  return { title: 'Вам нужна помощь?', label: 'СЕКУНД ДО SOS', note: null, steps: '' };
}
function deliveryLabel(status) { return ({ none: 'Отправка не выполнялась', preparing: 'Подготовка сообщения', disabled: 'Автоотправка выключена', unavailable: 'Канал не подключён', offline: 'Нет сети — не отправлено', sending: 'Отправляется…', simulated: 'Тест · ничего не отправлено', accepted: 'Принято Telegram', partial: 'Часть принята Telegram', failed: 'Не отправлено', unknown: 'Результат не подтверждён' })[status] || 'Статус неизвестен'; }
function showEmergency() {
  const event = machine.value; const countdown = event.status === 'countdown';
  const phase = countdown ? machine.phase() : null; const copy = countdownCopy(phase, event.test); shownPhase = phase;
  $('emergencyContent').innerHTML = `<div class="emergency-top"><span class="brand">${icon('shield')}PeSafe.</span>${badge(event.test ? 'УЧЕБНАЯ ТРЕВОГА' : 'ЭКСТРЕННЫЙ РЕЖИМ', event.test ? 'neutral' : 'red')}</div><div class="emergency-inner"><span class="emergency-symbol">${icon(countdown ? 'bell' : 'send')}</span><div class="eyebrow">${esc(REASONS[event.reason] || REASONS.manual)}</div><h1 id="emergencyTitle">${countdown ? copy.title : event.test ? 'Проверка пройдена' : 'SOS активирован'}</h1><p class="emergency-description">${countdown && copy.note ? esc(copy.note) : countdown ? event.test ? 'Это безопасный тест. Сообщений и звонков не будет.' : state.settings.autoDelivery && health && !health.dryRun ? 'Если не отменить, начнётся отправка в ваш Telegram-канал.' : 'Если не отменить, после всех отсчётов автоматически запросим открытие звонка. Телефон может попросить подтверждение.' : event.test ? 'Так выглядит экран помощи после отсчёта.' : 'PeSafe автоматически запрашивает открытие звонка на временный номер. Соединение не подтверждается приложением.'}</p>${countdown ? `${copy.steps}<div class="countdown-orbit phase-${phase}"><b id="countdownNumber">${machine.remaining()}</b><span>${copy.label}</span></div>${!event.test && state.settings.recordAudio ? '<div class="recording-box compact" id="recordingBox" role="status"></div>' : ''}<button class="button cancel-button" data-action="cancel-sos">${icon('check')} Я в порядке — отменить</button><button class="text-button emergency-now" data-action="send-now">${event.test ? 'Продолжить тест' : 'Нужна помощь сейчас'} ${icon('arrow')}</button>` : `<div class="delivery-result" role="status" id="deliveryResult">${esc(deliveryLabel(historyEntry(event).delivery))}</div>${event.test ? '' : '<div id="callStatus" class="auto-call-status" role="status"></div>'}<div class="emergency-location" id="emergencyLocation">${icon('pin')} ${freshLocation(lastLocation) ? `${lastLocation.lat.toFixed(5)}, ${lastLocation.lng.toFixed(5)} · ±${Math.round(lastLocation.accuracy)} м` : 'Текущие координаты недоступны'}</div><div class="recording-box" id="recordingBox" role="status"></div>${event.test ? '' : `<details class="dispatcher"><summary>${icon('phone')} ${EMERGENCY_CALL.temporary ? 'Текст для тестового звонка' : 'Что сказать диспетчеру 112'}</summary><pre id="dispatcherText"></pre>${button(`${icon('copy')} Скопировать`, 'copy-dispatcher', 'text-button')}</details>`}<div class="emergency-actions">${event.test ? '<div class="test-info">В тесте реальные звонки и отправка отключены.</div>' : `<a href="tel:${EMERGENCY_CALL.number}" class="button call-emergency">${icon('phone')} ${EMERGENCY_CALL.temporary ? 'Тестовый звонок' : 'Позвонить'} ${esc(EMERGENCY_CALL.displayNumber)}</a><a id="smsLink" class="button button-outline ${state.contacts.length ? '' : 'disabled'}" ${state.contacts.length ? '' : 'aria-disabled="true"'}>${icon('mail')} Подготовить SMS близким</a>${state.contacts[0] ? `<a href="tel:${esc(state.contacts[0].phone)}" class="button button-outline">${icon('phone')} ${esc(state.contacts[0].name)}</a>` : ''}<button class="button button-outline" data-action="share">${icon('copy')} Поделиться сообщением</button><button class="text-button" data-action="retry-delivery">Проверить / повторить отправку</button>`}</div><div class="active-privacy">${event.test ? 'Никакие данные не передавались.' : 'SMS и звонок требуют подтверждения на телефоне. Принятие Telegram не означает, что вас прочитали.'}</div><button class="button finish-button" data-action="finish-sos">${icon('check')} ${event.test ? 'Завершить проверку' : 'Я в безопасности — завершить'}</button>`}</div><p class="emergency-footer">${event.test ? 'Можно повторить проверку в любое время.' : 'PeSafe помогает связаться с близкими. Экстренная помощь — по номеру 112.'}</p>`;
  if (countdown && !event.test && EMERGENCY_CALL.autoCall) {
    const notice = document.createElement('p'); notice.className = 'auto-call-notice';
    notice.textContent = `После отсчётов автоматически запросим звонок на ${EMERGENCY_CALL.displayNumber}. Подтверждение телефона возможно.`;
    $('emergencyContent').querySelector('.countdown-orbit').insertAdjacentElement('afterend', notice);
  }
  if (countdown) {
    const controls = document.createElement('div'); controls.className = 'countdown-sound-controls';
    controls.innerHTML = '<span id="countdownSoundStatus" role="status"></span><button id="countdownSoundToggle" class="text-button" data-action="toggle-countdown-sound" type="button"></button>';
    $('emergencyContent').querySelector('.cancel-button').insertAdjacentElement('beforebegin', controls);
    updateCountdownSoundControls();
  }
  if (!$('emergencyDialog').open) $('emergencyDialog').showModal();
  updateRecordingUI();
  updateCallStatus();
  if (!countdown) updateMessageLinks();
}
const dispatcherText = () => { const event = machine.value; return dispatcherScript({ profile: state.profile, settings: state.settings, location: lastLocation, reason: event.reason, now: event.activatedAt || Date.now() }); };
function updateMessageLinks() {
  const event = machine.value;
  currentMessage ||= event.message || buildMessage({ profile: state.profile, settings: state.settings, location: lastLocation, reason: event.reason, test: event.test, now: event.activatedAt || Date.now() });
  if ($('smsLink') && state.contacts.length) $('smsLink').href = smsUrl(state.contacts, currentMessage, /iPad|iPhone|iPod/.test(navigator.userAgent));
  if ($('dispatcherText')) $('dispatcherText').textContent = dispatcherText();
}
function setDelivery(id, delivery) {
  const entry = state.history.find(e => e.id === id); if (entry) entry.delivery = delivery;
  persist(); if (machine.value.id === id && machine.value.status === 'active' && $('deliveryResult')) $('deliveryResult').textContent = deliveryLabel(delivery);
}
async function activateDelivery(event) {
  if (event.test) { setDelivery(event.id, 'simulated'); return; }
  // Не ждём GPS после отсчёта: запрос начат при старте. Не подставляем старые координаты.
  currentMessage = event.message || buildMessage({ profile: state.profile, settings: state.settings, location: lastLocation, reason: event.reason, now: event.activatedAt });
  machine.value.message = currentMessage; state.emergency = machine.value; persist(); updateMessageLinks();
  if (!state.settings.autoDelivery) return setDelivery(event.id, 'disabled');
  await deliver(event);
}
let accessKey = ''; // Не localStorage/sessionStorage: ключ живёт только в памяти вкладки.
async function checkChannel(key) {
  const response = await fetch(runtimeConfig.apiBase + '/api/health', { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json(); if (!response.ok || !data.configured) throw new Error(data.error || 'Канал не настроен на сервере');
  return data;
}
async function deliver(event) {
  if (submitting || machine.value.status !== 'active' || event.test) return;
  if (!navigator.onLine) return setDelivery(event.id, 'offline');
  if (!accessKey || !health) return setDelivery(event.id, 'unavailable');
  if (Date.now() - event.createdAt > 300000) { toast('Эта тревога старше 5 минут. Используйте SMS или звонок.'); return; }
  submitting = true; setDelivery(event.id, 'sending');
  try {
    const response = await fetch(runtimeConfig.apiBase + '/api/incidents', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessKey}` }, signal: AbortSignal.timeout(18000), body: JSON.stringify({ id: event.id, message: event.message || currentMessage, createdAt: event.createdAt, test: false }) });
    const data = await response.json();
    if (!response.ok) { setDelivery(event.id, 'failed'); toast(data.error || 'Сервер отклонил отправку', 5000); }
    else setDelivery(event.id, data.state);
  } catch {
    setDelivery(event.id, 'unknown'); toast('Нет подтверждения отправки. Используйте звонок или SMS.', 6000); return;
  } finally { submitting = false; }
  // Голосовая запись уходит следом за принятой текстовой тревогой (или когда допишется).
  uploadAudio();
}
function previewMessage() {
  const message = buildMessage({ profile: state.profile, settings: state.settings, location: lastLocation, reason: 'manual' });
  showDialog(`${dialogHeader('Что получат близкие?', 'Пример сообщения. Сейчас ничего не отправляется.')}<pre class="message-preview">${esc(message)}</pre><p class="card-description">Сейчас используется временный тестовый номер. Веб-версия не передаёт сообщение и не выполняет вызов в экстренные службы.</p>${button('Понятно', 'close-dialog', 'button button-dark full-width')}`);
}
function help() {
  showDialog(`${dialogHeader('Рядом, когда важно', 'Как работает PeSafe')}<div class="help-steps">${[['1', 'Подготовьте профиль', 'Личные данные, медкарта по желанию и хотя бы один близкий.'], ['2', 'Включите нужные датчики', 'Звук и тряска — простые пороговые сигналы. Это не проверенный детектор ДТП. Голос работает только там, где его поддерживает браузер.'], ['3', 'Отмените или подтвердите SOS', 'У вас есть время на отмену одним нажатием. После отсчёта откроется экран помощи.'], ['4', 'Свяжитесь с помощью', `Сейчас кнопка звонка ведёт на временный тестовый номер ${EMERGENCY_CALL.displayNumber}. Звонок подтверждается на телефоне. SMS — готовый текст.`], ['5', 'Голосовая запись (по желанию)', `До ${RECORD_SECONDS} секунд звука с начала тревоги. Запись активированного SOS хранится 30 дней и доступна в истории. Отменённая тревога не сохраняет запись. Нужно отдельное согласие.`]].map(([n, title, text]) => `<div><span>${n}</span><section><h3>${title}</h3><p>${text}</p></section></div>`).join('')}</div><div class="info-banner">${icon('info')}<p>При сворачивании датчики останавливаются. Браузер может задержать отсчёт при блокировке. Если есть возможность, звоните 112 самостоятельно.</p></div>${button('Безопасно проверить сценарий', 'test', 'button button-dark full-width')}`);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const action = el.dataset.action;
  if (action === 'nav') return navigate(el.dataset.page);
  if (action === 'close-dialog') { $('formDialog').close(); draft = null; return; }
  if (action === 'help') return help();
  if (action === 'onboard') return onboarding();
  if (action === 'onboard-back') return onboarding(Math.max(0, onboardingStep - 1));
  if (action === 'add-contact') return showContact();
  if (action === 'edit-contact') return showContact(el.dataset.id);
  if (action === 'prioritize-contact') { const chosen = state.contacts.find(c => c.id === el.dataset.id); if (!chosen) return; state.contacts = [chosen, ...state.contacts.filter(c => c.id !== chosen.id)]; persist(); render(); toast('Основной контакт изменён'); return; }
  if (action === 'remove-contact') { showDialog(`${dialogHeader('Удалить контакт?')}<p class="card-description">Он исчезнет из быстрого звонка и списка SMS. Получатели Telegram на сервере не изменятся.</p><div class="dialog-actions">${button('Оставить', 'close-dialog', 'button button-outline')}${button('Удалить', 'confirm-remove-contact', 'button button-danger', `data-id="${esc(el.dataset.id)}"`)}</div>`); return; }
  if (action === 'confirm-remove-contact') { state.contacts = state.contacts.filter(c => c.id !== el.dataset.id); persist(); $('formDialog').close(); render(); return; }
  if (action === 'sos') return startEmergency('manual');
  if (action === 'test') return startEmergency('test', true);
  if (action === 'toggle-countdown-sound') {
    if (state.settings.alertSounds && countdownAudio.status === 'ready') { state.settings.alertSounds = false; countdownAudio.stop(); }
    else { state.settings.alertSounds = true; countdownAudio.unlock().then(() => updateCountdownSoundControls()); }
    persist(); updateCountdownSoundControls(); return;
  }
  if (action === 'cancel-sos') return machine.cancel();
  if (action === 'send-now') return machine.activate();
  if (action === 'locate') { await locate(); if (locationState === 'error') toast('Нет доступа к GPS. Ручной SOS доступен и без координат.'); return; }
  if (action === 'preview') return previewMessage();
  if (action === 'retry-delivery') { const entry = state.history.find(e => e.id === machine.value.id); if (entry && ['accepted', 'partial', 'simulated'].includes(entry.delivery)) { if (!['sending', 'accepted', 'partial', 'simulated'].includes(entry.audio)) entry.audio = undefined; return uploadAudio(); } return deliver(machine.value); }
  if (action === 'stop-recording') return recorder.stop();
  if (action === 'share-audio') return shareAudio();
  if (action === 'download-audio') { const file = recorder.file(); if (file) { const link = document.createElement('a'); link.href = recorder.url; link.download = file.name; link.click(); } return; }
  if (action === 'copy-dispatcher') { try { await navigator.clipboard.writeText(dispatcherText()); toast('Текст для диспетчера скопирован'); } catch { toast('Не удалось скопировать. Прочитайте текст с экрана.'); } return; }
  if (action === 'share') { try { if (navigator.share) await navigator.share({ title: 'SOS · PeSafe', text: currentMessage }); else { await navigator.clipboard.writeText(currentMessage); toast('Текст SOS скопирован'); } } catch (err) { if (err.name !== 'AbortError') toast('Не удалось поделиться. Используйте SMS.'); } return; }
  if (action === 'finish-sos') {
    if (machine.value.test) return machine.finish();
    showDialog(`${dialogHeader('Вы в безопасности?')}<p class="card-description">Завершение закроет экран SOS. Уже отправленные сообщения нельзя отозвать. Сообщите близким, что помощь больше не нужна.</p><div class="dialog-actions">${button('Продолжить SOS', 'close-dialog', 'button button-outline')}${button('Завершить SOS', 'confirm-finish', 'button button-dark')}</div>`); return;
  }
  if (action === 'confirm-finish') { $('formDialog').close(); return machine.finish(); }
  if (action === 'disconnect') { accessKey = ''; health = null; state.settings.autoDelivery = false; persist(); render(); toast('Подключение отключено'); return; }
  if (action === 'export') {
    const blob = new Blob([JSON.stringify({ ...state, emergency: null }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'pesafe-my-data.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Экспорт содержит личные и медицинские данные. Храните его приватно.', 6000); return;
  }
  if (['delete-data', 'clear-history'].includes(action)) {
    if (['active', 'countdown'].includes(machine.value.status)) return toast('Сначала завершите SOS');
    showDialog(`${dialogHeader(action === 'delete-data' ? 'Удалить все данные PeSafe?' : 'Очистить историю?')}<p class="card-description">${action === 'delete-data' ? 'Профиль, медкарта, контакты и события будут удалены с этого устройства. Серверные квитанции хранятся отдельно до 30 дней.' : 'События будут удалены с этого устройства.'} Это действие нельзя отменить.</p><div class="dialog-actions">${button('Оставить данные', 'close-dialog', 'button button-outline')}${button('Удалить', action === 'delete-data' ? 'confirm-delete' : 'confirm-clear', 'button button-danger')}</div>`); return;
  }
  if (action === 'confirm-clear') { state.history = []; persist(); $('formDialog').close(); render(); return; }
  if (action === 'confirm-delete') return privacy.eraseAll();
});
document.addEventListener('change', e => {
  if (e.target.id === 'monitorToggle') return setMonitoring(e.target.checked);
  const key = e.target.dataset.setting;
  if (!key || !(key in DEFAULTS)) return;
  if (monitor && key !== 'alertSounds') { sensors.stop(); monitor = false; releaseWakeLock(); toast('Настройки изменены. Включите мониторинг заново.'); }
  state.settings[key] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value); persist();
  if (key === 'alertSounds') { if (state.settings.alertSounds) countdownAudio.unlock(); else countdownAudio.stop(); updateCountdownSoundControls(); }
  if (key === 'threshold' && $('thresholdValue')) $('thresholdValue').textContent = state.settings.threshold;
});
document.addEventListener('input', e => { if (e.target.id === 'threshold' && $('thresholdValue')) $('thresholdValue').textContent = e.target.value; });
document.addEventListener('submit', async e => {
  e.preventDefault(); const form = e.target; const data = Object.fromEntries(new FormData(form));
  if (form.id === 'contactForm') {
    const phone = normalizePhone(data.phone); if (!validPhone(phone) || !data.name.trim()) { $('contactError').textContent = 'Укажите имя и корректный международный номер телефона'; return; }
    if (state.contacts.some(c => c.phone === phone && c.id !== form.dataset.id)) { $('contactError').textContent = 'Этот номер уже есть в контактах'; return; }
    const contact = { id: form.dataset.id || crypto.randomUUID(), name: data.name.trim(), phone, relation: data.relation };
    if (form.dataset.id) state.contacts = state.contacts.map(c => c.id === form.dataset.id ? contact : c); else state.contacts.push(contact);
    persist(); $('formDialog').close(); render(); toast('Контакт сохранён');
  }
  if (form.id === 'profileForm') {
    const next = { ...state.profile, ...data, phone: normalizePhone(data.phone) }; const errors = profileErrors(next);
    if (Object.keys(errors).length) { $('profileError').textContent = Object.values(errors).join('. '); return; }
    state.profile = next; persist(); render(); toast('Медицинская карточка сохранена');
  }
  if (form.id === 'onboardForm') {
    if (onboardingStep === 0) { draft.profile = { ...draft.profile, ...data, phone: normalizePhone(data.phone) }; const errors = profileErrors(draft.profile); if (Object.keys(errors).length) { $('onboardError').textContent = Object.values(errors).join('. '); return; } onboarding(1); }
    else if (onboardingStep === 1) { draft.profile = { ...draft.profile, ...data }; onboarding(2); }
    else {
      if (!state.contacts.length || data.name || data.phone) {
        if (!data.name?.trim() || !validPhone(data.phone)) { $('onboardError').textContent = 'Укажите имя близкого и международный номер телефона'; return; }
        if (state.contacts.some(c => c.phone === normalizePhone(data.phone))) { $('onboardError').textContent = 'Этот контакт уже добавлен. Очистите поля или укажите другой номер.'; return; }
        if (state.contacts.length >= 10) { $('onboardError').textContent = 'Уже добавлено 10 контактов. Очистите поля, чтобы продолжить.'; return; }
        state.contacts.push({ id: crypto.randomUUID(), name: data.name.trim(), phone: normalizePhone(data.phone), relation: 'Близкий человек' });
      }
      state.profile = draft.profile; state.onboarded = true; persist(); draft = null; $('formDialog').close(); render(); toast('Профиль готов. Теперь можно включить мониторинг.');
    }
  }
  if (form.id === 'channelForm') {
    const submit = form.querySelector('button[type=submit]'); submit.disabled = true; $('channelStatus').textContent = 'Проверяем подключение…';
    try { health = await checkChannel(data.accessKey.trim()); accessKey = data.accessKey.trim(); $('channelStatus').textContent = health.dryRun ? 'Подключено в учебном режиме. Реальная отправка выключена.' : `Подключено. Получателей Telegram: ${health.recipients}. Включите автоотправку выше.`; form.reset(); }
    catch (err) { health = null; accessKey = ''; $('channelStatus').textContent = err.message || 'Не удалось подключиться'; }
    finally { submit.disabled = false; }
  }
});
$('emergencyDialog').addEventListener('cancel', e => { e.preventDefault(); if (machine.value.status === 'countdown') machine.cancel(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) countdownAudio.suspend();
  if (document.hidden && recorder.state === 'recording') recorder.stop();
  if (document.hidden && monitor) { monitor = false; paused = true; sensors.stop(); releaseWakeLock(); render(); }
  if (!document.hidden) { machine.tick(); if (machine.value.callState === 'deferred') calls.request(machine.value, EMERGENCY_CALL); if (paused) toast('Мониторинг остановлен при сворачивании. Включите его снова.', 5000); }
});
addEventListener('online', network); addEventListener('offline', () => { network(); toast('Нет интернета. Автоотправка недоступна. Звонок и SMS зависят от сотовой сети.', 6000); });
addEventListener('hashchange', () => { const next = location.hash.slice(1); if (pageNames[next] && page !== next) { page = next; render(); scrollTo({ top: 0, behavior: 'instant' }); } });
setInterval(() => {
  machine.tick();
  countdownAudio.update({ event: machine.value, phase: machine.phase(), remaining: machine.remaining(), enabled: state.settings.alertSounds });
  // Смена этапа двойного предупреждения перерисовывает экран; второе предупреждение — сильная вибрация.
  if (machine.value.status === 'countdown' && $('emergencyDialog').open && machine.phase() !== shownPhase) { showEmergency(); if (shownPhase === 'second' && !machine.value.test) navigator.vibrate?.([500, 150, 500, 150, 500]); }
  if ($('countdownNumber')) $('countdownNumber').textContent = machine.remaining(); if ($('recElapsed')) $('recElapsed').textContent = recorder.elapsed(); }, 150);
privacy = createPrivacy({ getState: () => state, replaceState: next => { state = next; }, persist, render, getPage: () => page, isEmergency: () => ['active', 'countdown'].includes(machine.value.status), stopAll: () => { countdownAudio.stop(); recorder.discard(); sensors.stop(); monitor = false; machine.value = { status: 'idle' }; lastLocation = null; currentMessage = ''; accessKey = ''; health = null; draft = null; releaseWakeLock(); }, showDialog, header: dialogHeader, icon, button, esc, toast, onboard: () => onboarding(), resetView: () => navigate('home') });
await privacy.runMaintenance();
render();
if (['countdown', 'active'].includes(machine.value.status)) {
  currentMessage = machine.value.message || '';
  showEmergency();
  // После перезагрузки нет ключа канала. Не повторяем ранее начатую отправку автоматически.
  if (machine.value.status === 'active') { setDelivery(machine.value.id, machine.value.test ? 'simulated' : 'unknown'); toast(machine.value.test ? 'Восстановлена учебная проверка. Ничего не отправлялось.' : 'Восстановлен активный SOS. Проверьте связь с близкими.', 6000); }
  else machine.tick();
} else if (!state.onboarded) onboarding();
if ('serviceWorker' in navigator && !location.protocol.startsWith('capacitor')) navigator.serviceWorker.register('./sw.js').catch(() => {});

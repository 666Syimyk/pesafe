import { emptyStore } from './storage.js';
import { DAY, registrationPeriod, profileExpiry, hasAudioConsent, AUDIO_CONSENT_VERSION } from './retention.js';
import { saveRecording, listRecordings, getRecording, deleteRecording, purgeRecordings, recordingFilename } from './recordings.js';
import { SosRecorder, RECORD_SECONDS } from './recorder.js';
import { alertSound } from './sounds.js';

export function createPrivacy({ getState, replaceState, persist, render, getPage, isEmergency, stopAll, showDialog, header, icon, button, esc, toast, onboard, resetView }) {
  let maintenance = false, consentAction = null, manual = null, manualSaving = false, manualSaved = false, manualSaveError = false;
  const urls = new Set();
  const date = value => new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Bishkek', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const urlFor = blob => { const url = URL.createObjectURL(blob); urls.add(url); return url; };
  const release = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); };
  const fail = err => toast(err?.message || 'Хранилище записей недоступно. Запись можно скачать с экрана SOS.', 6000);
  function download(blob, filename) { const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
  async function refreshLibrary() {
    const target = document.getElementById('audioLibrary'); if (!target) return;
    try {
      const profileId = getState().retention?.id;
      const rows = profileId ? await listRecordings(profileId) : [];
      if (!target.isConnected) return;
      target.innerHTML = rows.length ? rows.map(row => `<div class="archive-row"><span class="soft-icon">${icon(row.kind === 'sos' ? 'bell' : 'mic')}</span><div class="archive-info"><b>${row.kind === 'sos' ? 'Запись SOS' : 'Обычная запись'} · ${row.duration} с</b><small>${esc(date(row.createdAt))} · ${(row.size / 1024).toFixed(0)} КБ</small><small>Удаление: ${esc(date(row.expiresAt))}</small></div><div class="archive-actions">${button(icon('voice'), 'listen-recording', 'icon-button', `data-id="${esc(row.id)}" aria-label="Прослушать запись"`)}${button(icon('download'), 'download-recording', 'icon-button', `data-id="${esc(row.id)}" aria-label="Скачать запись"`)}${button(icon('trash'), 'delete-recording', 'icon-button danger-text', `data-id="${esc(row.id)}" aria-label="Удалить запись"`)}</div></div>`).join('') : '<div class="archive-empty">Сохранённых записей нет. Обычная запись хранится 24 часа, запись активированного SOS — до 30 дней.</div>';
    } catch (err) { target.textContent = err.message; }
  }
  function libraryHtml() { return `<section class="card settings-card audio-archive"><div class="section-heading"><span class="soft-icon pink">${icon('mic')}</span><div><h2>Голосовые записи</h2><p>Обычные — 24 часа · SOS — 30 дней, но не дольше срока профиля</p></div></div>${button(`${icon('mic')} Записать голос`, 'manual-recording', 'button button-dark')}<div id="audioLibrary" class="audio-library" aria-live="polite">Загружаем записи…</div><p class="card-description">Файлы хранятся в этом браузере. При его очистке они могут исчезнуть раньше. Скачанные и отправленные копии PeSafe удалить не сможет.</p></section>`; }
  function retentionHtml() {
    const period = getState().retention;
    return `<section class="card settings-card retention-card"><div class="section-heading"><span class="soft-icon">${icon('clock')}</span><div><h2>Сроки хранения и согласие</h2><p>Профиль и контакты — один год, без автоматического продления</p></div></div><p class="card-description">${period ? `Данные профиля удалятся ${esc(date(period.expiresAt))}. За 30 дней до этого появится предупреждение.` : 'Год хранения начнётся при сохранении личных данных.'} Проверка и очистка выполняются при открытии приложения и каждую минуту, пока оно открыто. Закрытый браузер не может гарантировать удаление точно в назначенную минуту.</p><div class="retention-details"><span>Обычные записи: <b>24 часа</b></span><span>Записи активированного SOS: <b>30 дней</b></span><span>Запись голоса: <b>${hasAudioConsent(getState()) ? 'согласие получено' : 'нужно отдельное согласие'}</b></span></div><div class="channel-controls">${period ? button('Подтвердить использование на год', 'renew-profile', 'button button-outline') : ''}${hasAudioConsent(getState()) ? button('Отозвать согласие на запись', 'revoke-audio-consent', 'text-button danger-text') : button('О согласии на запись', 'audio-consent', 'text-button')}</div></section>`;
  }
  function soundsHtml() { return `<section class="card settings-card sound-library"><div class="section-heading"><span class="soft-icon">${icon('bell')}</span><div><h2>Звуки для скачивания</h2><p>WAV-файлы. Воспроизведение только по вашему нажатию.</p></div></div>${[['notice', 'Предупреждение'], ['sos', 'Сигнал SOS']].map(([id, label]) => `<div class="sound-row"><b>${label}</b><div>${button('Прослушать', 'listen-sound', 'text-button', `data-sound="${id}"`)}${button(`${icon('download')} Скачать`, 'download-sound', 'button button-outline', `data-sound="${id}"`)}</div></div>`).join('')}</section>`; }
  function mount() {
    const state = getState(), status = profileExpiry(state.retention);
    if (status.warning) document.getElementById('main').insertAdjacentHTML('afterbegin', `<div class="retention-warning" role="alert"><span>${icon('clock')}</span><div><b>${status.expired ? 'Срок хранения профиля истёк' : `До удаления профиля: ${status.daysLeft} дн.`}</b><p>${status.expired && isEmergency() ? 'Очистка будет выполнена после завершения текущего SOS.' : `Профиль, медкарта, контакты, история и локальные записи удалятся ${esc(date(state.retention.expiresAt))}.`}</p></div>${button('Я пользуюсь — продлить', 'renew-profile', 'button button-dark')}</div>`);
    if (getPage() === 'history') { document.getElementById('main').insertAdjacentHTML('beforeend', libraryHtml()); refreshLibrary(); }
    if (getPage() === 'settings') { document.querySelector('.settings-main').insertAdjacentHTML('beforeend', retentionHtml() + soundsHtml()); }
  }
  function requestConsent(action = 'setting') {
    if (!getState().onboarded) { toast('Сначала заполните профиль, чтобы определить срок хранения записи'); onboard(); return; }
    consentAction = action;
    showDialog(`${header('Разрешить запись голоса?', 'Микрофон включается только для выбранного вами сценария.')}<form id="audioConsentForm"><div class="consent-explanation"><p>Обычная запись хранится <b>24 часа</b>, запись активированного SOS — <b>30 дней</b>. Все записи удаляются также при истечении годового срока профиля.</p><p>Файлы сохраняются локально в браузере без отдельного шифрования. Их можно прослушать, скачать или удалить. При отмене тревоги её временная запись удаляется сразу.</p><p>Передача близким возможна через отдельно включённый Telegram-канал или по вашей команде. Уже скачанные и отправленные копии автоматически не очищаются.</p></div><label class="consent"><input name="audioConsent" type="checkbox" required><span>Разрешаю запись и локальное хранение голоса на указанные сроки. Я могу отозвать согласие в настройках.</span></label><button type="submit" class="button button-dark full-width">Подтвердить согласие</button></form>`);
  }
  function manualHtml() {
    const status = manual?.state;
    return `<div id="manualRecordingState">${status === 'recording' ? `<p>Идёт запись · не более ${RECORD_SECONDS} секунд</p>${button('Остановить и сохранить', 'save-manual-recording', 'button button-dark full-width')}` : status === 'ready' ? `<p>${manualSaved ? 'Запись сохранена на 24 часа.' : manualSaveError ? 'Архив недоступен. Скачайте запись сейчас.' : 'Запись готова. Сохраняем в архив…'}</p><audio controls src="${manual.url}"></audio><a class="button button-outline full-width" href="${manual.url}" download="${esc(manual.file().name)}">${icon('download')} Скачать запись</a>` : status === 'requesting' ? '<p>Запрашиваем микрофон…</p>' : '<p>Запись недоступна. Проверьте разрешение микрофона.</p>'}</div>`;
  }
  async function startManual() {
    if (isEmergency()) return toast('Сначала завершите текущий SOS');
    if (!hasAudioConsent(getState())) return requestConsent('manual');
    if (profileExpiry(getState().retention).expired) { await runMaintenance(); return; }
    const period = getState().retention;
    if (!period) { onboard(); return; }
    manual?.discard(); manualSaving = false; manualSaved = false; manualSaveError = false;
    const current = new SosRecorder({ onState: status => {
      if (current !== manual) return;
      const box = document.getElementById('manualRecordingState'); if (box) box.outerHTML = manualHtml();
      if (status === 'ready' && !manualSaving) {
        manualSaving = true;
        if (getState().retention?.id !== period.id || !hasAudioConsent(getState())) return;
        saveRecording({ id: current.eventId, kind: 'ordinary', profileId: period.id, profileExpiresAt: period.expiresAt, createdAt: current.startedAt, duration: current.duration, blob: current.blob }).then(() => { manualSaved = true; toast('Запись сохранена на 24 часа'); refreshLibrary(); }).catch(err => { manualSaveError = true; fail(err); }).finally(() => { const box = document.getElementById('manualRecordingState'); if (box && manual === current) box.outerHTML = manualHtml(); });
      }
    } });
    manual = current;
    showDialog(`${header('Записать голос', 'До 30 секунд · удаление через 24 часа')}${manualHtml()}`);
    await current.start(crypto.randomUUID());
  }
  async function archiveSOS(recorder, event) {
    if (recorder._archivePromise) return recorder._archivePromise;
    const state = getState();
    if (event.test || !['active', 'resolved'].includes(event.status) || !hasAudioConsent(state) || recorder.state !== 'ready' || !state.retention || recorder._profileId !== state.retention.id) return;
    const row = { id: recorder.eventId, eventId: event.id, profileId: state.retention.id, profileExpiresAt: state.retention.expiresAt, kind: 'sos', createdAt: recorder.startedAt, activatedAt: event.activatedAt, duration: recorder.duration, blob: recorder.blob };
    recorder._archivePromise = saveRecording(row).then(() => { refreshLibrary(); return true; }).catch(err => { fail(err); return false; });
    return recorder._archivePromise;
  }
  async function eraseAll() {
    stopAll(); manual?.discard(); manual = null; release();
    replaceState({ ...emptyStore(), pendingAudioPurge: true }); persist();
    let cleared = false;
    try { await purgeRecordings({ all: true }); getState().pendingAudioPurge = false; persist(); cleared = true; }
    catch (err) { fail(err); }
    document.getElementById('formDialog').close(); resetView(); onboard(); return cleared;
  }
  async function runMaintenance() {
    if (maintenance) return; maintenance = true;
    try {
      if (profileExpiry(getState().retention).expired && !isEmergency()) { const cleared = await eraseAll(); toast(cleared ? 'Годовой срок истёк. Профиль и локальные записи очищены.' : 'Профиль очищен. Очистку аудио повторим при доступности хранилища.', 6500); return; }
      if (getState().pendingAudioPurge) { await purgeRecordings({ all: true }); getState().pendingAudioPurge = false; persist(); }
      else await purgeRecordings();
      if (getPage() === 'history') refreshLibrary();
    } catch (err) { fail(err); }
    finally { maintenance = false; }
  }
  document.getElementById('formDialog').addEventListener('close', () => { if (document.getElementById('formDialog').open) return; release(); manual?.discard(); manual = null; });
  document.addEventListener('change', event => {
    if (event.target.dataset.setting === 'recordAudio' && event.target.checked && !hasAudioConsent(getState())) { event.stopImmediatePropagation(); event.target.checked = false; requestConsent('setting'); }
  }, true);
  document.addEventListener('submit', event => {
    if (event.target.id !== 'audioConsentForm') return;
    event.preventDefault(); if (!event.target.reportValidity()) return;
    getState().audioConsent = { version: AUDIO_CONSENT_VERSION, grantedAt: Date.now() }; getState().settings.recordAudio = true;
    if (!persist()) { getState().audioConsent = null; getState().settings.recordAudio = false; return; }
    const action = consentAction; consentAction = null; document.getElementById('formDialog').close(); render();
    if (action === 'manual') startManual(); else toast('Согласие сохранено. Запись при SOS включена.');
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-action]'); if (!el) return;
    const action = el.dataset.action;
    try {
      if (action === 'audio-consent') return requestConsent();
      if (action === 'manual-recording') return startManual();
      if (action === 'save-manual-recording') return manual?.stop();
      if (action === 'revoke-audio-consent') { getState().audioConsent = null; getState().settings.recordAudio = false; manual?.discard(); persist(); render(); toast('Новые записи голоса выключены. Сохранённые можно удалить в истории.'); return; }
      if (action === 'renew-profile') {
        if (!getState().retention) return;
        showDialog(`${header('Продлить хранение на год?')}<p class="card-description">Вы подтверждаете, что пользуетесь PeSafe. Профиль и контакты будут храниться до ${esc(date(registrationPeriod().expiresAt))}. Сроки уже сохранённых голосовых записей не продлеваются.</p><div class="dialog-actions">${button('Отмена', 'close-dialog', 'button button-outline')}${button('Подтверждаю использование', 'confirm-renew-profile', 'button button-dark')}</div>`); return;
      }
      if (action === 'confirm-renew-profile') { const previous = getState().retention; getState().retention = registrationPeriod(Date.now(), previous.id); if (!persist()) { getState().retention = previous; return; } document.getElementById('formDialog').close(); render(); toast('Хранение профиля продлено на год'); return; }
      if (action === 'delete-recording') { await deleteRecording(el.dataset.id); refreshLibrary(); return; }
      if (['listen-recording', 'download-recording'].includes(action)) {
        const row = await getRecording(el.dataset.id, getState().retention?.id);
        if (!row) { refreshLibrary(); toast('Срок записи истёк или она удалена'); return; }
        if (action === 'download-recording') return download(row.blob, recordingFilename(row));
        showDialog(`${header(row.kind === 'sos' ? 'Запись SOS' : 'Голосовая запись', `Удаление: ${date(row.expiresAt)}`)}<audio controls class="archive-player" src="${urlFor(row.blob)}"></audio>${button(`${icon('download')} Скачать запись`, 'download-recording', 'button button-dark full-width', `data-id="${esc(row.id)}"`)}`); return;
      }
      if (['listen-sound', 'download-sound'].includes(action)) {
        const sound = alertSound(el.dataset.sound === 'sos' ? 'sos' : 'notice');
        if (action === 'download-sound') return download(sound.blob, sound.filename);
        showDialog(`${header('Прослушать сигнал', 'Этот звук не запускает SOS.')}<audio controls class="archive-player" src="${urlFor(sound.blob)}"></audio>`);
      }
    } catch (err) { fail(err); }
  });
  setInterval(() => { runMaintenance(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) manual?.stop(); else { runMaintenance(); render(); } });
  return { mount, requestConsent, archiveSOS, eraseAll, runMaintenance, refreshLibrary, canRecord: () => hasAudioConsent(getState()) };
}

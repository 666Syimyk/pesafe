import { test, expect } from './test-base.js';
const DAY = 86400000;
const profile = { firstName: 'Алина', lastName: 'Тестовая', phone: '+996555000001', birthDate: '1995-03-12', address: 'Тестовый адрес' };
async function ready(page, options = {}) {
  await page.addInitScript(({ profile, options }) => {
    const now = Date.now(), registeredAt = now - (options.ageDays || 0) * 86400000, expiresAt = registeredAt + 365 * 86400000;
    if (!localStorage.getItem('pesafe.v2')) localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile, contacts: [{ id: 'c', name: 'Мама', phone: '+996555000002' }], history: [], settings: { recordAudio: !!options.recordAudio }, retention: { id: 'test-profile', registeredAt, expiresAt }, audioConsent: options.consent ? { version: 1, grantedAt: now } : null }));
    window.__mic = { opened: 0, stopped: 0 };
    navigator.mediaDevices.getUserMedia = async () => { window.__mic.opened++; return { getTracks: () => [{ stop: () => window.__mic.stopped++ }], getAudioTracks: () => [] }; };
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith('audio/webm'); }
      constructor(stream, options) { this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() { if (this.state !== 'recording') return; this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) }); this.onstop?.(); }); }
    };
  }, { profile, options });
  await page.goto('/'); await expect(page.locator('main h1')).toBeVisible();
}
const beginSOS = async page => { await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); };
const finishSOS = async page => { await page.getByRole('button', { name: 'Я в безопасности — завершить' }).click(); await page.locator('#formDialog').getByRole('button', { name: 'Завершить SOS', exact: true }).click(); };

test('перед записью требуется отдельное согласие; до него микрофон не включается', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); await page.locator('[data-setting=recordAudio]').click();
  await expect(page.locator('#audioConsentForm')).toBeVisible(); await expect(page.locator('#audioConsentForm')).toContainText('24 часа'); await expect(page.locator('#audioConsentForm')).toContainText('30 дней'); expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
  await page.locator('#audioConsentForm [name=audioConsent]').check(); await page.getByRole('button', { name: 'Подтвердить согласие' }).click(); await expect(page.locator('[data-setting=recordAudio]')).toBeChecked();
  await page.reload(); await expect(page.locator('[data-setting=recordAudio]')).toBeChecked();
});
test('обычная запись сохраняется в IndexedDB, скачивается и доступна после reload', async ({ page }) => {
  await ready(page, { consent: true }); await page.goto('/#history'); await page.getByRole('button', { name: 'Записать голос', exact: true }).click();
  await page.getByRole('button', { name: 'Остановить и сохранить' }).click(); await expect(page.locator('#toast')).toContainText('Запись сохранена');
  await page.locator('#formDialog').getByRole('button', { name: 'Закрыть' }).click(); await page.reload(); await expect(page.locator('.archive-row')).toHaveCount(1); await expect(page.locator('.archive-row')).toContainText('Обычная запись');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать запись', exact: true }).click()]); expect(download.suggestedFilename()).toMatch(/^pesafe-ordinary-.*\.webm$/);
});
test('SOS сохраняет даже досрочно завершённую запись на 30 дней', async ({ page }) => {
  await ready(page, { consent: true, recordAudio: true }); await beginSOS(page); await finishSOS(page); await page.goto('/#history');
  await expect(page.locator('.archive-row')).toHaveCount(1); await expect(page.locator('.archive-row')).toContainText('Запись SOS');
  const metadata = await page.evaluate(async () => { const rows = await (await import('/recordings.js')).listRecordings('test-profile'); return rows[0]; });
  expect(metadata.expiresAt - metadata.activatedAt).toBe(30 * DAY); await page.reload(); await expect(page.locator('.archive-row')).toHaveCount(1);
});
test('отменённая тревога не сохраняет голос', async ({ page }) => {
  await ready(page, { consent: true, recordAudio: true }); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await expect(page.locator('#recordingBox')).toContainText('Идёт запись'); await page.getByRole('button', { name: 'Я в порядке — отменить' }).click(); await page.goto('/#history'); await expect(page.locator('.archive-row')).toHaveCount(0);
});
test('просроченные записи физически удаляются, непросроченные SOS остаются', async ({ page }) => {
  await ready(page, { consent: true });
  await page.evaluate(async DAY => { const { saveRecording } = await import('/recordings.js'); const now = Date.now(); const profileExpiresAt = now + 365 * DAY; const blob = new Blob(['test'], { type: 'audio/webm' }); await saveRecording({ id: 'ordinary-old', profileId: 'test-profile', kind: 'ordinary', createdAt: now - 2 * DAY, duration: 1, blob, profileExpiresAt }, now - 2 * DAY); await saveRecording({ id: 'sos-fresh', profileId: 'test-profile', kind: 'sos', createdAt: now, activatedAt: now, duration: 1, blob, profileExpiresAt }); }, DAY);
  await page.goto('/#history'); await expect(page.locator('.archive-row')).toHaveCount(1); await expect(page.locator('.archive-row')).toContainText('Запись SOS');
  const count = await page.evaluate(() => new Promise(resolve => { const request = indexedDB.open('pesafe-audio-v1', 1); request.onsuccess = () => { const db = request.result; const r = db.transaction('recordings').objectStore('recordings').count(); r.onsuccess = () => { resolve(r.result); db.close(); }; }; })); expect(count).toBe(1);
});
test('за 30 дней виден срок удаления; продление требует подтверждения', async ({ page }) => {
  await ready(page, { ageDays: 350 }); await expect(page.locator('.retention-warning')).toContainText('До удаления профиля');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).retention.expiresAt);
  await page.getByRole('button', { name: 'Я пользуюсь — продлить' }).click(); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).retention.expiresAt)).toBe(before);
  await page.getByRole('button', { name: 'Подтверждаю использование' }).click(); await expect(page.locator('.retention-warning')).toHaveCount(0); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).retention.expiresAt)).toBeGreaterThan(before);
});
test('истёкший профиль очищается вместе с архивом при открытии', async ({ page }) => {
  await ready(page, { consent: true });
  await page.evaluate(async DAY => { const { saveRecording } = await import('/recordings.js'); await saveRecording({ id: 'to-delete', profileId: 'test-profile', kind: 'sos', createdAt: Date.now(), duration: 1, blob: new Blob(['test'], { type: 'audio/webm' }) }); const state = JSON.parse(localStorage.getItem('pesafe.v2')); state.retention.registeredAt = Date.now() - 370 * DAY; state.retention.expiresAt = Date.now() - 5 * DAY; localStorage.setItem('pesafe.v2', JSON.stringify(state)); }, DAY);
  await page.reload(); await expect(page.locator('#formDialog')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).profile.firstName)).toBe('');
  const rows = await page.evaluate(async () => (await import('/recordings.js')).listRecordings('test-profile')); expect(rows).toEqual([]);
});
test('удаление всех данных включает голосовой архив', async ({ page }) => {
  await ready(page, { consent: true }); await page.evaluate(async () => (await import('/recordings.js')).saveRecording({ id: 'delete-me', profileId: 'test-profile', kind: 'ordinary', createdAt: Date.now(), duration: 1, blob: new Blob(['test'], { type: 'audio/webm' }) }));
  await page.goto('/#settings'); await page.getByRole('button', { name: 'Удалить все данные' }).click(); await page.locator('#formDialog').getByRole('button', { name: 'Удалить', exact: true }).click(); await expect(page.locator('main h1')).toContainText('Хорошо, когда помощь рядом'); expect(await page.evaluate(async () => (await import('/recordings.js')).listRecordings('test-profile'))).toEqual([]);
});
test('сигнал скачивается как WAV без микрофона', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action=download-sound][data-sound=sos]').click()]); expect(download.suggestedFilename()).toBe('pesafe-sos.wav'); expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
});

// Голосовая запись SOS и подсказка для 112. Микрофон и MediaRecorder подменены.
import { test, expect } from './test-base.js';

const profile = { firstName: 'Алина', lastName: 'Тестовая', patronymic: '', phone: '+996555000001', birthDate: '1995-03-12', address: 'Тестовый адрес', blood: '', conditions: '', allergies: '', medication: '' };
async function ready(page, settings = {}) {
  await page.addInitScript(({ store }) => {
    if (!localStorage.getItem('pesafe.v2')) localStorage.setItem('pesafe.v2', JSON.stringify(store));
    window.__mic = { opened: 0, stopped: 0 };
    navigator.mediaDevices.getUserMedia = async () => { window.__mic.opened++; return { getTracks: () => [{ stop: () => window.__mic.stopped++ }], getAudioTracks: () => [] }; };
    window.MediaRecorder = class {
      static isTypeSupported(type) { return type.startsWith('audio/webm'); }
      constructor(stream, options) { this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() { if (this.state !== 'recording') return; this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) }); this.onstop?.(); }
    };
  }, { store: { version: 2, onboarded: true, profile, contacts: [{ id: 'c1', name: 'Мама', phone: '+996555000002', relation: 'Мама' }], history: [], settings: { countdown: 10, ...settings }, audioConsent: settings.recordAudio ? { version: 1, grantedAt: Date.now() } : null, emergency: null } });
  await page.goto('/');
}
const sos = page => page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' });

test('переключатель записи есть в настройках и сохраняется', async ({ page }) => {
  await ready(page);
  await page.goto('/#settings');
  await page.locator('[data-setting=recordAudio]').click();
  await page.locator('#audioConsentForm [name=audioConsent]').check(); await page.getByRole('button', { name: 'Подтвердить согласие' }).click();
  await page.reload();
  await expect(page.locator('[data-setting=recordAudio]')).toBeChecked();
});

test('запись выключена по умолчанию: микрофон не открывается', async ({ page }) => {
  await ready(page);
  await sos(page).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await expect(page.locator('#recordingBox')).toContainText('выключена в настройках');
  expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
});

test('запись идёт во время отсчёта и удаляется при отмене', async ({ page }) => {
  await ready(page, { recordAudio: true });
  await sos(page).click();
  await expect(page.locator('#recordingBox')).toContainText('Идёт запись звука');
  await page.getByRole('button', { name: 'Я в порядке — отменить' }).click();
  expect(await page.evaluate(() => window.__mic)).toEqual({ opened: 1, stopped: 1 });
  await page.goto('/#history');
  await expect(page.locator('.history-row')).toContainText('Отменено');
});

test('после SOS: запись готова через 30 с, есть плеер и ручная отправка; подсказка для 112', async ({ page }) => {
  await ready(page, { recordAudio: true });
  await page.clock.install();
  await sos(page).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await expect(page.locator('#recordingBox')).toContainText('Идёт запись');
  await page.clock.runFor(31000);
  await expect(page.locator('#recordingBox')).toContainText('Запись готова');
  await expect(page.locator('#recordingBox audio')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#audioStatus')).toHaveText('Хранится только на этом телефоне');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Отправить запись' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^pesafe-sos-.*\.webm$/);
  await page.locator('.dispatcher summary').click();
  await expect(page.locator('#dispatcherText')).toContainText('Сигнал из приложения PeSafe');
  await expect(page.locator('#dispatcherText')).toContainText('Тестовая Алина');
  await page.getByRole('button', { name: 'Я в безопасности — завершить' }).click();
  await page.locator('#formDialog').getByRole('button', { name: 'Завершить SOS' }).click();
  expect(await page.evaluate(() => window.__mic.stopped)).toBe(1);
});

test('кнопка «Остановить» завершает запись досрочно', async ({ page }) => {
  await ready(page, { recordAudio: true });
  await sos(page).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(page.locator('#recordingBox')).toContainText('Запись готова');
});

test('нет доступа к микрофону — честное сообщение, SOS работает', async ({ page }) => {
  await ready(page, { recordAudio: true });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await sos(page).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await expect(page.locator('#recordingBox')).toContainText('Нет доступа к микрофону');
  await expect(page.getByRole('link', { name: 'Тестовый звонок +996 221 212 111' })).toBeVisible();
});

test('учебный режим: запись не ведётся', async ({ page }) => {
  await ready(page, { recordAudio: true });
  await page.getByRole('button', { name: /Проверить сценарий/ }).click();
  await page.getByRole('button', { name: 'Продолжить тест' }).click();
  await expect(page.locator('#recordingBox')).toContainText('В учебном режиме');
  await expect(page.locator('.dispatcher')).toHaveCount(0);
  expect(await page.evaluate(() => window.__mic.opened)).toBe(0);
});

test('через подключённый канал запись уходит следом за тревогой', async ({ page }) => {
  await ready(page, { recordAudio: true, autoDelivery: true });
  await page.route('**/api/health', route => route.fulfill({ json: { configured: true, dryRun: false, recipients: 1 } }));
  const order = []; let audioType = '', audioSize = 0;
  await page.route('**/api/incidents', route => { order.push('text'); return route.fulfill({ json: { state: 'accepted', accepted: 1, total: 1 } }); });
  await page.route('**/api/incidents/*/audio', route => { order.push('audio'); audioType = route.request().headers()['content-type']; audioSize = route.request().postDataBuffer().length; return route.fulfill({ json: { state: 'accepted', accepted: 1, total: 1 } }); });
  await page.goto('/#settings');
  await page.locator('[name=accessKey]').fill('a'.repeat(32));
  await page.getByRole('button', { name: 'Проверить подключение' }).click();
  await expect(page.locator('#channelStatus')).toContainText('Получателей Telegram: 1');
  await page.locator('.side-nav').getByRole('button', { name: 'Обзор', exact: true }).click();
  await sos(page).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await expect(page.locator('#deliveryResult')).toHaveText('Принято Telegram');
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(page.locator('#audioStatus')).toHaveText('Запись принята Telegram');
  expect(order).toEqual(['text', 'audio']);
  expect(audioType).toContain('audio/webm');
  expect(audioSize).toBe(4000);
  await page.goto('/#home');
});

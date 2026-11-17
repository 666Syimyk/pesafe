import { test, expect } from './test-base.js';
const profile = { firstName: 'Алина', lastName: 'Тестовая', patronymic: '', phone: '+996555000001', birthDate: '1995-03-12', address: 'Тестовый адрес', blood: '', conditions: '', allergies: '', medication: '' };
async function ready(page) {
  await page.addInitScript(({ profile }) => {
    if (!localStorage.getItem('pesafe.v2')) localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile, contacts: [{ id: 'contact-1', name: 'Мама', phone: '+996555000002', relation: 'Мама' }], history: [], settings: { countdown: 10 }, emergency: null }));
  }, { profile });
  await page.goto('/');
}
test('регистрация в три шага, данные сохраняются после перезагрузки', async ({ page }) => {
  await page.goto('/'); const d = page.locator('#formDialog'); await expect(d).toBeVisible();
  for (const key of ['lastName', 'firstName', 'birthDate', 'phone', 'address']) await d.locator(`[name="${key}"]`).fill(profile[key]);
  await d.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await d.getByRole('button', { name: 'Далее / пропустить' }).click();
  await d.locator('[name=name]').fill('Мама'); await d.locator('[name=phone]').fill('+996555000002'); await d.locator('[name=consent]').check();
  await d.getByRole('button', { name: 'Завершить настройку' }).click(); await expect(d).not.toBeVisible(); await page.reload(); await expect(page.getByRole('heading', { name: /Здравствуйте, Алина/ })).toBeVisible(); await expect(d).not.toBeVisible();
});
test('контакты: добавление, дубликат, приоритет и сохранение второго контакта', async ({ page }) => {
  await ready(page); await page.locator('.side-nav').getByRole('button', { name: /Мои близкие/ }).click(); await page.getByRole('button', { name: 'Добавить близкого', exact: true }).click();
  let d = page.locator('#formDialog'); await d.locator('[name=name]').fill('Друг'); await d.locator('[name=phone]').fill('+996555000003'); await d.getByRole('button', { name: 'Добавить близкого' }).click();
  await page.getByRole('button', { name: 'Сделать основным' }).click(); await expect(page.locator('.person-card').first()).toContainText('Друг'); await expect(page.locator('.person-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Добавить близкого', exact: true }).click(); await d.locator('[name=name]').fill('Дубликат'); await d.locator('[name=phone]').fill('+996555000003'); await d.getByRole('button', { name: 'Добавить близкого' }).click(); await expect(d.locator('#contactError')).toContainText('уже есть');
});
test('SOS отменяется без отправки; повторная активация создаёт новый инцидент', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await expect(page.locator('#emergencyDialog')).toBeVisible();
  await page.getByRole('button', { name: 'Я в порядке — отменить' }).click(); await expect(page.locator('#emergencyDialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); await expect(page.locator('#deliveryResult')).toHaveText('Автоотправка выключена'); await expect(page.getByRole('link', { name: 'Тестовый звонок +996 221 212 111' })).toHaveAttribute('href', 'tel:+996221212111'); await expect(page.locator('#smsLink')).toHaveAttribute('href', /^sms:\+996555000002\?/);
});
test('учебный режим не вызывает отправку и не содержит ссылок звонков', async ({ page }) => {
  await ready(page); await expect(page.locator('a[href="tel:112"]')).toHaveCount(0);
  let calls = 0; page.on('request', r => { if (r.url().includes('/api/incidents')) calls++; });
  await ready(page); await page.getByRole('button', { name: /Проверить сценарий/ }).click(); await page.getByRole('button', { name: 'Продолжить тест' }).click(); await expect(page.locator('#deliveryResult')).toHaveText('Тест · ничего не отправлено'); await expect(page.locator('#emergencyDialog a[href^="tel:"]')).toHaveCount(0); await page.getByRole('button', { name: 'Завершить проверку' }).click(); expect(calls).toBe(0);
});
test('отсчёт срабатывает по deadline и восстанавливает активную сессию', async ({ page }) => {
  await ready(page); await page.clock.install(); await page.getByRole('button', { name: /Проверить сценарий/ }).click(); await page.clock.runFor(25200); await expect(page.getByRole('heading', { name: 'Проверка пройдена' })).toBeVisible(); await page.reload(); await expect(page.locator('#emergencyDialog')).toBeVisible(); await expect(page.locator('#deliveryResult')).toHaveText('Тест · ничего не отправлено'); await page.getByRole('button', { name: 'Завершить проверку' }).click();
});
test('неподключённый канал не имитирует отправку', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); await page.locator('[data-setting=autoDelivery]').check(); await page.goto('/#home'); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); await expect(page.locator('#deliveryResult')).toHaveText('Канал не подключён');
});
test('настоящие координаты браузера включаются в SMS, адрес проживания помечен отдельно', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: 42.8746, longitude: 74.5698, accuracy: 30 }); await ready(page);
  await page.getByRole('button', { name: 'Обновить местоположение' }).click(); await expect(page.locator('#locationTitle')).toContainText('42.87460');
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); const href = decodeURIComponent(await page.locator('#smsLink').getAttribute('href')); expect(href).toContain('42.874600'); expect(href).toContain('не место происшествия');
});
test('имя с HTML отображается текстом, а не выполняется', async ({ page }) => {
  await ready(page); await page.goto('/#profile'); await page.locator('[name=firstName]').fill('<img src=x onerror=alert(1)>'); await page.getByRole('button', { name: 'Сохранить изменения' }).click(); await page.goto('/#home'); await expect(page.locator('main h1')).toContainText('<img'); await expect(page.locator('main h1 img')).toHaveCount(0);
});
test('навигация и Escape доступны с клавиатуры', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).focus(); await page.keyboard.press('Enter'); await expect(page.locator('#emergencyDialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#emergencyDialog')).not.toBeVisible();
});
test('отказ в микрофоне не включает фиктивную защиту', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); await page.locator('[data-setting=motion]').uncheck(); await page.goto('/#home');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.locator('#monitorToggle').click(); await expect(page.locator('#monitorToggle')).not.toBeChecked(); await expect(page.locator('#toast')).toContainText('Датчики недоступны');
});
test('серия motion-событий запускает тот же экран отсчёта', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); await page.locator('[data-setting=sound]').uncheck(); await page.goto('/#home');
  await page.clock.install(); await page.locator('#monitorToggle').click(); await expect(page.locator('#monitorToggle')).toBeChecked();
  for (let i = 0; i < 3; i++) { await page.evaluate(() => dispatchEvent(new DeviceMotionEvent('devicemotion', { acceleration: { x: 30, y: 0, z: 0 } }))); await page.clock.runFor(200); }
  await expect(page.locator('#emergencyDialog')).toBeVisible(); await expect(page.locator('#emergencyContent .eyebrow')).toHaveText('Сильная тряска телефона'); await page.getByRole('button', { name: 'Я в порядке — отменить' }).click();
});
test('поддерживаемая голосовая команда запускает отсчёт', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); await page.locator('[data-setting=sound]').uncheck(); await page.locator('[data-setting=motion]').uncheck(); await page.locator('[data-setting=voice]').check(); await page.goto('/#home');
  await page.evaluate(() => { window.SpeechRecognition = class { constructor() { window.mockSpeech = this; } start() { this.onstart?.(); } abort() {} }; });
  await page.locator('#monitorToggle').click(); await expect(page.locator('#sensor-voice')).toHaveText('Работает');
  await page.evaluate(() => { const result = [{ transcript: 'Мне нужна помощь' }]; result.isFinal = true; window.mockSpeech.onresult({ resultIndex: 0, results: [result] }); });
  await expect(page.locator('#emergencyDialog')).toBeVisible(); await expect(page.locator('#emergencyContent .eyebrow')).toHaveText('Голосовая команда');
});
test('через подключённый учебный gateway нет ложного сообщения о доставке', async ({ page }) => {
  await ready(page);
  await page.route('**/api/health', route => route.fulfill({ json: { configured: true, dryRun: true, recipients: 1 } }));
  let captured = null;
  await page.route('**/api/incidents', async route => { captured = route.request().postDataJSON(); await route.fulfill({ json: { state: 'simulated', accepted: 0, total: 1 } }); });
  await page.goto('/#settings'); await page.locator('[name=accessKey]').fill('a'.repeat(32)); await page.getByRole('button', { name: 'Проверить подключение' }).click(); await expect(page.locator('#channelStatus')).toContainText('учебном'); await page.locator('[data-setting=autoDelivery]').check();
  await page.locator('.side-nav').getByRole('button', { name: 'Обзор', exact: true }).click(); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); await expect(page.locator('#deliveryResult')).toHaveText('Тест · ничего не отправлено'); expect(captured.test).toBe(false); expect(captured.message).not.toContain('Заболевания');
  await page.getByRole('button', { name: 'Я в безопасности — завершить' }).click(); await page.getByRole('button', { name: 'Завершить SOS', exact: true }).click(); await expect(page.locator('#emergencyDialog')).not.toBeVisible();
});
test('интерфейс кэшируется офлайн; API не попадает в кэш', async ({ page, context }) => {
  await ready(page); await page.evaluate(async () => { await navigator.serviceWorker.ready; }); await page.reload(); await context.setOffline(true); await page.reload(); await expect(page.locator('main h1')).toContainText('Алина'); await expect(page.locator('#network')).toContainText('Без интернета');
  expect(await page.evaluate(async () => { const keys = await caches.keys(); const all = await Promise.all(keys.map(async k => (await (await caches.open(k)).keys()).map(r => r.url))); return all.flat().some(url => url.includes('/api/')); })).toBe(false);
});
for (const width of [360, 390, 768, 1440]) test(`адаптивность ${width}px: страницы не выходят за экран`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); const errors = []; page.on('pageerror', e => errors.push(e.message)); await ready(page);
  for (const route of ['home', 'contacts', 'profile', 'history', 'settings']) { await page.goto('/#' + route); await expect(page.locator('main')).not.toBeEmpty(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); }
  expect(errors).toEqual([]);
});

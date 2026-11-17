// Полный прогон кнопок и действий интерфейса (дополняет app.spec.js).
import { test, expect } from './test-base.js';

const profile = { firstName: 'Алина', lastName: 'Тестовая', patronymic: '', phone: '+996555000001', birthDate: '1995-03-12', address: 'Тестовый адрес', blood: '', conditions: '', allergies: '', medication: '' };
const contacts = [
  { id: 'c1', name: 'Мама', phone: '+996555000002', relation: 'Мама' },
  { id: 'c2', name: 'Айбек', phone: '+996555000003', relation: 'Друг / подруга' },
];
async function ready(page, extra = {}) {
  await page.addInitScript(({ store }) => {
    if (!localStorage.getItem('pesafe.v2')) localStorage.setItem('pesafe.v2', JSON.stringify(store));
  }, { store: { version: 2, onboarded: true, profile, contacts, history: [], settings: { countdown: 10 }, emergency: null, ...extra } });
  await page.goto('/');
}
const dialog = page => page.locator('#formDialog');
const nav = (page, name) => page.locator('.side-nav').getByRole('button', { name, exact: true });

test('шапка: «?» открывает справку, из неё запускается учебный сценарий', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'О приложении' }).click();
  await expect(dialog(page)).toContainText('Как работает PeSafe');
  await dialog(page).getByRole('button', { name: 'Закрыть' }).click();
  await expect(dialog(page)).not.toBeVisible();
  await page.getByRole('button', { name: 'Как работает PeSafe' }).click();
  await dialog(page).getByRole('button', { name: 'Безопасно проверить сценарий' }).click();
  await expect(page.locator('#emergencyDialog')).toContainText('УЧЕБНАЯ ТРЕВОГА');
  await page.getByRole('button', { name: 'Я в порядке — отменить' }).click();
  await expect(page.locator('#emergencyDialog')).not.toBeVisible();
});

test('«Что получат близкие?» показывает сообщение с именем, «Понятно» закрывает', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: /Что получат близкие/ }).click();
  await expect(dialog(page).locator('.message-preview')).toContainText('Тестовая Алина');
  await expect(dialog(page).locator('.message-preview')).toContainText('SOS · PeSafe');
  await dialog(page).getByRole('button', { name: 'Понятно' }).click();
  await expect(dialog(page)).not.toBeVisible();
});

test('кнопка GPS без разрешения сообщает об ошибке, не ломая SOS', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (_ok, fail) => fail({ code: 1 }); });
  await page.getByRole('button', { name: 'Обновить местоположение' }).click();
  await expect(page.locator('#toast')).toContainText('Нет доступа к GPS');
  await expect(page.locator('#locationTitle')).toHaveText('Местоположение недоступно');
});

test('главная: звонок близкому, «Все», «Добавить близкого», временный номер в подвале', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('link', { name: 'Позвонить: Мама' })).toHaveAttribute('href', 'tel:+996555000002');
  await expect(page.locator('.app-footer a')).toHaveAttribute('href', 'tel:+996221212111');
  await page.locator('.add-contact-dashed').click();
  await expect(dialog(page)).toContainText('Кто будет рядом?');
  await dialog(page).getByRole('button', { name: 'Закрыть' }).click();
  await page.locator('.close-card').getByRole('button', { name: /Все/ }).click();
  await expect(page.locator('main h1')).toHaveText('Мои близкие');
  await expect(page).toHaveURL(/#contacts$/);
});

test('контакты: редактирование, неверный номер, удаление с отменой и подтверждением', async ({ page }) => {
  await ready(page); await nav(page, /Мои близкие/).click();
  await page.getByRole('button', { name: 'Редактировать: Айбек' }).click();
  await dialog(page).locator('[name=phone]').fill('123');
  await dialog(page).getByRole('button', { name: /Сохранить изменения/ }).click();
  await expect(dialog(page).locator('#contactError')).toContainText('корректный');
  await dialog(page).locator('[name=phone]').fill('+996 555 000 009');
  await dialog(page).locator('[name=name]').fill('Айбек Друг');
  await dialog(page).getByRole('button', { name: /Сохранить изменения/ }).click();
  await expect(page.locator('.person-card').nth(1)).toContainText('Айбек Друг');
  await expect(page.locator('.person-card').nth(1)).toContainText('+996555000009');

  await page.getByRole('button', { name: 'Удалить: Айбек Друг' }).click();
  await dialog(page).getByRole('button', { name: 'Оставить' }).click();
  await expect(page.locator('.person-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Удалить: Айбек Друг' }).click();
  await dialog(page).getByRole('button', { name: 'Удалить' }).click();
  await expect(page.locator('.person-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.person-card')).toHaveCount(1);
});

test('медкарта: кнопка профиля в боковом меню, ошибка валидации, сохранение', async ({ page }) => {
  await ready(page);
  await page.locator('.profile-shortcut').click();
  await expect(page.locator('main h1')).toHaveText('Медицинская карточка');
  await page.locator('#profileForm [name=phone]').fill('12');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.locator('#profileError')).toContainText('международном');
  await page.locator('#profileForm [name=phone]').fill('+996555000001');
  await page.locator('#profileForm [name=blood]').selectOption('A (II) Rh+');
  await page.locator('#profileForm [name=allergies]').fill('Пенициллин');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.locator('#toast')).toContainText('сохранена');
  await page.reload();
  await expect(page.locator('#profileForm [name=blood]')).toHaveValue('A (II) Rh+');
  await expect(page.locator('#profileForm [name=allergies]')).toHaveValue('Пенициллин');
});

test('настройки: время отмены, порог, переключатели сохраняются; медкарта попадает в SOS только с согласия', async ({ page }) => {
  await ready(page, { profile: { ...profile, allergies: 'Пенициллин' } });
  await nav(page, 'Настройки').click();
  await page.locator('[data-setting=countdown]').selectOption('20');
  await page.locator('#threshold').fill('75');
  await page.locator('#threshold').dispatchEvent('change');
  await expect(page.locator('#thresholdValue')).toHaveText('75');
  await page.locator('[data-setting=voice]').check();
  await page.locator('[data-setting=shareMedical]').check();
  await page.reload();
  await expect(page.locator('[data-setting=countdown]')).toHaveValue('20');
  await expect(page.locator('#threshold')).toHaveValue('75');
  await expect(page.locator('[data-setting=voice]')).toBeChecked();
  await nav(page, 'Обзор').click();
  await expect(page.locator('.sos-hint')).toContainText('по 20 с');
  await page.getByRole('button', { name: /Что получат близкие/ }).click();
  await expect(dialog(page).locator('.message-preview')).toContainText('Аллергии: Пенициллин');
});

test('настройки: «Отключить» канал и неверный ключ', async ({ page }) => {
  await ready(page); await nav(page, 'Настройки').click();
  await page.locator('[name=accessKey]').fill('b'.repeat(40));
  await page.getByRole('button', { name: 'Проверить подключение' }).click();
  await expect(page.locator('#channelStatus')).toContainText('Неверный ключ');
  await page.getByRole('button', { name: 'Отключить' }).click();
  await expect(page.locator('#toast')).toContainText('Подключение отключено');
  await expect(page.locator('[data-setting=autoDelivery]')).not.toBeChecked();
});

test('экспорт скачивает JSON с данными', async ({ page }) => {
  await ready(page); await nav(page, 'Настройки').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Экспорт моих данных/ }).click()]);
  expect(download.suggestedFilename()).toBe('pesafe-my-data.json');
  const data = JSON.parse(await (await download.createReadStream()).toArray().then(c => Buffer.concat(c).toString('utf8')));
  expect(data.profile.firstName).toBe('Алина');
  expect(data.contacts).toHaveLength(2);
});

test('история: событие появляется, очистка с отменой и подтверждением', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: /Проверить сценарий/ }).click();
  await page.getByRole('button', { name: 'Я в порядке — отменить' }).click();
  await nav(page, 'История событий').click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.history-row')).toContainText('Отменено');
  await page.getByRole('button', { name: /Очистить историю/ }).click();
  await dialog(page).getByRole('button', { name: 'Оставить данные' }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.getByRole('button', { name: /Очистить историю/ }).click();
  await dialog(page).getByRole('button', { name: 'Удалить' }).click();
  await expect(page.locator('.history-row')).toHaveCount(0);
  await page.locator('.history-card').getByRole('button', { name: 'Проверить сценарий' }).click();
  await expect(page.locator('#emergencyDialog')).toBeVisible();
});

test('активный SOS: SMS всем, звонок основному, «Поделиться», повтор, «Продолжить SOS»', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => { navigator.share = async data => { window.__shared = data; }; });
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
  await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await expect(page.getByRole('heading', { name: 'SOS активирован' })).toBeVisible();
  await expect(page.locator('#smsLink')).toHaveAttribute('href', /^sms:\+996555000002,\+996555000003\?body=/);
  await expect(page.locator('#emergencyDialog a[href="tel:+996555000002"]')).toContainText('Мама');
  await page.getByRole('button', { name: 'Поделиться сообщением' }).click();
  expect((await page.evaluate(() => window.__shared)).text).toContain('SOS · PeSafe');
  await page.getByRole('button', { name: 'Проверить / повторить отправку' }).click();
  await expect(page.locator('#deliveryResult')).toHaveText('Канал не подключён');
  await page.getByRole('button', { name: 'Я в безопасности — завершить' }).click();
  await dialog(page).getByRole('button', { name: 'Продолжить SOS' }).click();
  await expect(page.locator('#emergencyDialog')).toBeVisible();
  await page.getByRole('button', { name: 'Я в безопасности — завершить' }).click();
  await dialog(page).getByRole('button', { name: 'Завершить SOS' }).click();
  await expect(page.locator('#emergencyDialog')).not.toBeVisible();
  await expect(page.locator('#toast')).toContainText('SOS завершён');
});

test('во время SOS нельзя удалить данные', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
  await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await page.evaluate(() => document.querySelector('#emergencyDialog').close());
  await page.goto('/#settings');
  await page.evaluate(() => document.querySelector('[data-action="delete-data"]')?.click());
  await expect(page.locator('#toast')).toContainText('Сначала завершите SOS');
});

test('мониторинг: включение и выключение переключателем', async ({ page }) => {
  await ready(page, { settings: { countdown: 10, sound: false, motion: true, voice: false } });
  await page.locator('#monitorToggle').click();
  await expect(page.locator('#protectionState')).toHaveText('Мониторинг включён');
  await expect(page.locator('#sensor-motion')).toHaveText('Ждём данные');
  await page.locator('#monitorToggle').click();
  await expect(page.locator('#protectionState')).toHaveText('Спокойствие начинается с готовности');
  await expect(page.locator('#monitorToggle')).not.toBeChecked();
});

test('мониторинг без выбранных датчиков отправляет в настройки', async ({ page }) => {
  await ready(page, { settings: { countdown: 10, sound: false, motion: false, voice: false } });
  await page.locator('#monitorToggle').click();
  await expect(page.locator('#toast')).toContainText('Выберите хотя бы один датчик');
  await expect(page.locator('main h1')).toHaveText('Спокойствие в деталях');
});

test('регистрация: «Назад» сохраняет введённое, «Позже» закрывает, «Настроить» открывает снова', async ({ page }) => {
  await page.goto('/');
  const d = dialog(page);
  for (const key of ['lastName', 'firstName', 'birthDate', 'phone', 'address']) await d.locator(`[name="${key}"]`).fill(profile[key]);
  await d.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await expect(d).toContainText('Важное о вашем здоровье');
  await d.getByRole('button', { name: 'Назад' }).click();
  await expect(d.locator('[name=firstName]')).toHaveValue('Алина');
  await d.getByRole('button', { name: 'Заполнить позже' }).click();
  await expect(d).not.toBeVisible();
  await page.getByRole('button', { name: /Настроить/ }).click();
  await expect(d).toContainText('Давайте познакомимся');
  // «Позже» сбрасывает черновик — заполняем снова
  for (const key of ['lastName', 'firstName', 'birthDate', 'phone', 'address']) await d.locator(`[name="${key}"]`).fill(profile[key]);
  await d.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await d.getByRole('button', { name: 'Далее / пропустить' }).click();
  await d.getByRole('button', { name: 'Завершить настройку' }).click();
  await expect(d).toBeVisible(); // без согласия и контакта форма не отправляется
});

test('удаление всех данных возвращает к регистрации', async ({ page }) => {
  // Без addInitScript, чтобы данные не подкладывались заново после перезагрузки.
  await page.goto('/');
  await page.evaluate(s => localStorage.setItem('pesafe.v2', JSON.stringify(s)), { version: 2, onboarded: true, profile, contacts, history: [], settings: {}, emergency: null });
  await page.goto('/#settings'); await page.reload();
  await expect(page.locator('main h1')).toHaveText('Спокойствие в деталях');
  await expect(dialog(page)).not.toBeVisible();
  await page.getByRole('button', { name: /Удалить все данные/ }).click();
  await dialog(page).getByRole('button', { name: 'Оставить данные' }).click();
  await expect(dialog(page)).not.toBeVisible();
  await page.getByRole('button', { name: /Удалить все данные/ }).click();
  await dialog(page).getByRole('button', { name: 'Удалить' }).click();
  await expect(dialog(page)).toContainText('Давайте познакомимся');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).onboarded)).toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).profile.firstName)).toBe('');
});

test('мобильное меню (390px): все 5 вкладок переключаются', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const titles = { 'Мои близкие': 'Мои близкие', 'Медкарта': 'Медицинская карточка', 'История событий': 'История событий', 'Настройки': 'Спокойствие в деталях', 'Обзор': /Здравствуйте/ };
  for (const [tab, title] of Object.entries(titles)) {
    await page.locator('.mobile-nav').getByRole('button', { name: new RegExp(tab) }).click();
    await expect(page.locator('main h1')).toHaveText(title);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  }
  await expect(page.locator('.sos-button')).toBeInViewport();
});

test('SOS-кнопка ярко-красная', async ({ page }) => {
  await ready(page);
  const bg = await page.locator('.sos-button').evaluate(el => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('rgb(255, 32, 32)');
});

test('двойное предупреждение: 1-й отсчёт → пауза → последнее → SOS; отмена на паузе', async ({ page }) => {
  await ready(page);
  await page.clock.install();
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
  await expect(page.locator('#emergencyTitle')).toHaveText('Вам нужна помощь?');
  await expect(page.locator('.stage-steps .current')).toHaveText('1');
  await page.clock.runFor(10500);
  await expect(page.locator('#emergencyTitle')).toHaveText('Проверим ещё раз');
  await expect(page.locator('.countdown-orbit')).toHaveClass(/phase-pause/);
  await expect(page.locator('.stage-steps .done')).toHaveText('✓');
  await page.clock.runFor(5000);
  await expect(page.locator('#emergencyTitle')).toHaveText('Последнее предупреждение');
  await expect(page.locator('.stage-steps .current')).toHaveText('2');
  await page.clock.runFor(10000);
  await expect(page.getByRole('heading', { name: 'SOS активирован' })).toBeVisible();
  await page.getByRole('button', { name: 'Я в безопасности — завершить' }).click();
  await dialog(page).getByRole('button', { name: 'Завершить SOS' }).click();
  // Отмена во время паузы — SOS не уходит
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
  await page.clock.runFor(12000);
  await expect(page.locator('#emergencyTitle')).toHaveText('Проверим ещё раз');
  await page.getByRole('button', { name: 'Я в порядке — отменить' }).click();
  await page.clock.runFor(30000);
  await expect(page.locator('#emergencyDialog')).not.toBeVisible();
});

test('двойное предупреждение можно выключить — тогда один отсчёт', async ({ page }) => {
  await ready(page);
  await nav(page, 'Настройки').click();
  await page.locator('[data-setting=doubleCheck]').uncheck();
  await nav(page, 'Обзор').click();
  await expect(page.locator('.sos-hint')).toContainText('10 секунд');
  await page.clock.install();
  await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
  await expect(page.locator('.stage-steps')).toHaveCount(0);
  await page.clock.runFor(10500);
  await expect(page.getByRole('heading', { name: 'SOS активирован' })).toBeVisible();
});

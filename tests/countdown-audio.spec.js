import { test, expect } from './test-base.js';
async function ready(page, settings = {}, flags = {}) {
  await page.clock.install();
  await page.addInitScript(({ settings, flags }) => {
    Object.assign(window, flags);
    if (!localStorage.getItem('pesafe.v2')) localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile: { firstName: 'Тест', lastName: 'Проверка', phone: '+996555000001', birthDate: '1995-01-01', address: 'Тестовый адрес' }, contacts: [{ id: 'c', name: 'Контакт', phone: '+996555000002' }], history: [], settings: { countdown: 10, doubleCheck: true, ...settings } }));
  }, { settings, flags });
  await page.goto('/'); await expect(page.locator('main h1')).toBeVisible();
}
const begin = page => page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
const metrics = page => page.evaluate(() => window.__soundMetrics || { starts: [], active: 0, contexts: 0 });
test('первый отсчёт, пауза и финальные секунды имеют разные сигналы', async ({ page }) => {
  await ready(page); await begin(page); await page.clock.runFor(500); expect((await metrics(page)).starts[0].hz).toBe(660);
  await page.clock.runFor(10000); const pause = await metrics(page); expect(pause.starts.slice(-2).map(x => x.hz)).toEqual([440, 520]);
  await page.clock.runFor(2000); expect((await metrics(page)).starts.length).toBe(pause.starts.length);
  await page.clock.runFor(4000); expect((await metrics(page)).starts.some(x => x.hz === 880)).toBe(true);
  await page.clock.runFor(7000); expect((await metrics(page)).starts.some(x => x.hz >= 900)).toBe(true);
});
test('отмена немедленно выключает все тоны и будущие сигналы', async ({ page }) => {
  await ready(page); await begin(page); await page.clock.runFor(500); const before = await metrics(page); expect(before.starts.length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Я в порядке — отменить' }).click(); const cancelled = await metrics(page); expect(cancelled.active).toBe(0); await page.clock.runFor(3000); expect((await metrics(page)).starts.length).toBe(cancelled.starts.length);
});
test('тихий режим можно включить и выключить прямо на таймере', async ({ page }) => {
  await ready(page, { alertSounds: false }); await begin(page); await page.clock.runFor(500); expect((await metrics(page)).starts).toEqual([]);
  await page.locator('#countdownSoundToggle').click(); await page.clock.runFor(500); expect((await metrics(page)).starts.length).toBeGreaterThan(0);
  await page.locator('#countdownSoundToggle').click(); const count = (await metrics(page)).starts.length; await page.clock.runFor(2500); expect((await metrics(page)).starts.length).toBe(count); expect((await metrics(page)).active).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pesafe.v2')).settings.alertSounds)).toBe(false);
});
test('настройка звуков сохраняется после перезагрузки', async ({ page }) => {
  await ready(page); await page.goto('/#settings'); await page.locator('[data-setting=alertSounds]').uncheck(); await page.reload(); await expect(page.locator('[data-setting=alertSounds]')).not.toBeChecked();
});
test('блокировка autoplay не останавливает таймер, кнопка разблокирует звук', async ({ page }) => {
  await ready(page, {}, { __audioLocked: true }); await begin(page); await page.clock.runFor(500); await expect(page.locator('#countdownSoundStatus')).toContainText('коснитесь'); expect((await metrics(page)).starts).toEqual([]);
  await page.evaluate(() => window.__audioLocked = false); await page.locator('#countdownSoundToggle').click(); await page.clock.runFor(700); await expect(page.locator('#countdownSoundStatus')).toContainText('включены'); expect((await metrics(page)).starts.length).toBeGreaterThan(0);
});
test('перед автозапросом звонка звуки отсчёта прекращаются', async ({ page }) => {
  await ready(page); await begin(page); await page.clock.runFor(500); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); expect((await metrics(page)).active).toBe(0);
  const before = (await metrics(page)).starts.length; await page.clock.runFor(2000); expect((await metrics(page)).starts.length).toBe(before); expect(await page.evaluate(() => window.__pesafeCallRequests)).toEqual(['tel:+996221212111']);
});
test('выключение звуков не отключает уже включённый мониторинг', async ({ page }) => {
  await ready(page, { sound: false, motion: true }); await page.locator('#monitorToggle').click(); await expect(page.locator('#monitorToggle')).toBeChecked(); await page.goto('/#settings'); await page.locator('[data-setting=alertSounds]').uncheck(); await page.goto('/#home'); await expect(page.locator('#monitorToggle')).toBeChecked();
});

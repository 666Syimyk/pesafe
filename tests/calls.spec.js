import { test, expect } from './test-base.js';
async function ready(page) {
  await page.addInitScript(() => { if (!localStorage.getItem('pesafe.v2')) localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile: { firstName: 'Тест', lastName: 'Тестовый', phone: '+996555000001', birthDate: '1995-01-01', address: 'Тестовый адрес' }, contacts: [{ id: 'c', name: 'Контакт', phone: '+996555000002' }], history: [], settings: { countdown: 10, doubleCheck: true } })); });
  await page.goto('/'); await expect(page.locator('main h1')).toBeVisible();
}
const requests = page => page.evaluate(() => window.__pesafeCallRequests || []);
test('запрос звонка появляется сам только после обоих отсчётов и паузы', async ({ page }) => {
  await ready(page); await page.clock.install(); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click();
  await page.clock.runFor(10500); expect(await requests(page)).toEqual([]); await page.clock.runFor(5000); expect(await requests(page)).toEqual([]);
  await page.clock.runFor(10000); await expect.poll(() => requests(page)).toEqual(['tel:+996221212111']); await expect(page.locator('#callStatus')).toContainText('Факт вызова не подтверждён');
  await page.clock.runFor(5000); expect(await requests(page)).toHaveLength(1);
});
test('отмена во время второго отсчёта предотвращает звонок', async ({ page }) => {
  await ready(page); await page.clock.install(); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.clock.runFor(17000); await page.getByRole('button', { name: 'Я в порядке — отменить' }).click(); await page.clock.runFor(15000); expect(await requests(page)).toEqual([]);
});
test('немедленная помощь запрашивает звонок один раз, reload не повторяет его', async ({ page }) => {
  await ready(page); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click(); expect(await requests(page)).toEqual(['tel:+996221212111']);
  await page.reload(); await expect(page.locator('#emergencyDialog')).toBeVisible(); expect(await requests(page)).toEqual([]); await expect(page.locator('#callStatus')).toContainText('Факт вызова не подтверждён');
});
test('учебный SOS не запрашивает звонок после всех таймеров', async ({ page }) => {
  await ready(page); await page.clock.install(); await page.getByRole('button', { name: /Проверить сценарий/ }).click(); await page.clock.runFor(26000); await expect(page.getByRole('heading', { name: 'Проверка пройдена' })).toBeVisible(); expect(await requests(page)).toEqual([]);
});
test('блокировка браузера оставляет честный статус и ручную кнопку', async ({ page }) => {
  await ready(page); await page.evaluate(() => window.__blockPhoneTransport = true); await page.getByRole('button', { name: 'SOS — начать отсчёт тревоги' }).click(); await page.getByRole('button', { name: 'Нужна помощь сейчас' }).click();
  await expect(page.locator('#callStatus')).toContainText('не позволил автоматически'); await expect(page.locator('.call-emergency')).toHaveAttribute('href', 'tel:+996221212111'); expect(await requests(page)).toHaveLength(1);
});

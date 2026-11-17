import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pesafe-preview-'));
const server = await createApp({ dataDir, env: {} });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const out = path.resolve('docs', 'previews'); await mkdir(out, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } }); const page = await context.newPage();
  await page.goto(base); await page.screenshot({ path: path.join(out, 'onboarding.png'), fullPage: true });
  await page.evaluate(() => localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile: { firstName: 'Алина', lastName: 'Тестовая', phone: '+996555000001', birthDate: '1995-03-12', address: 'Бишкек, тестовый адрес' }, contacts: [{ id: '1', name: 'Мама', phone: '+996555000002', relation: 'Мама' }, { id: '2', name: 'Айбек', phone: '+996555000003', relation: 'Друг / подруга' }], settings: {}, history: [] })));
  await page.reload(); await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
  await page.getByRole('button', { name: /Проверить сценарий/ }).click(); await page.screenshot({ path: path.join(out, 'sos-mobile.png'), fullPage: true });
  console.log('Сохранены desktop, mobile, onboarding и sos-mobile в docs/previews. Данные вымышленные.');
} finally { await browser.close(); await new Promise(r => server.close(r)); await rm(dataDir, { recursive: true, force: true }); }

import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server.js';
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pesafe-retention-preview-'));
const server = await createApp({ dataDir, env: {} }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const out = path.resolve('docs/previews'); await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  await page.addInitScript(() => {
    if (localStorage.getItem('pesafe.v2')) return;
    const now = Date.now(), DAY = 86400000;
    localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile: { firstName: 'Алина', lastName: 'Тестовая', phone: '+996555000001', birthDate: '1995-03-12', address: 'Тестовый адрес' }, contacts: [{ id: 'demo', name: 'Мама', phone: '+996555000002' }], settings: {}, history: [], retention: { id: 'preview-profile', registeredAt: now - 350 * DAY, expiresAt: now + 15 * DAY }, audioConsent: { version: 1, grantedAt: now } }));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/#history`);
  await page.evaluate(async () => { const { saveRecording } = await import('/recordings.js'); const now = Date.now(), DAY = 86400000; for (const [kind, age] of [['sos', DAY], ['ordinary', 100000]]) await saveRecording({ id: 'preview-' + kind, kind, profileId: 'preview-profile', createdAt: now - age, activatedAt: kind === 'sos' ? now - age : null, duration: 30, blob: new Blob([new Uint8Array(128000)], { type: 'audio/webm' }), profileExpiresAt: now + 15 * DAY }); });
  await page.reload(); await page.locator('.archive-row').first().waitFor();
  await page.screenshot({ path: path.join(out, 'retention-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.audio-archive').screenshot({ path: path.join(out, 'recordings-mobile.png') });
  await page.goto(`http://127.0.0.1:${server.address().port}/#settings`); await page.getByRole('button', { name: 'Отозвать согласие на запись' }).click(); await page.locator('[data-setting=recordAudio]').click(); await page.locator('#audioConsentForm').waitFor();
  await page.screenshot({ path: path.join(out, 'recording-consent-mobile.png') });
  console.log('Сохранены превью хранения и согласия. Все профили и файлы вымышленные.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await rm(dataDir, { recursive: true, force: true }); }

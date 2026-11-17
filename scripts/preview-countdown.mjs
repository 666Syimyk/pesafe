import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const server = spawn(process.execPath, ['tests/e2e-server.mjs'], { env: { ...process.env, PORT: '8083' }, stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 50; i++) { try { if ((await fetch('http://127.0.0.1:8083')).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem('pesafe.v2', JSON.stringify({ version: 2, onboarded: true, profile: { firstName: 'Алина', lastName: 'Тестовая', phone: '+996555000001', birthDate: '1995-01-01', address: 'Тестовый адрес' }, contacts: [], settings: {}, history: [] })));
  await page.goto('http://127.0.0.1:8083');
  await page.getByRole('button', { name: /Проверить сценарий/ }).click();
  await page.clock.runFor(500);
  await mkdir('docs/previews', { recursive: true });
  await page.screenshot({ path: 'docs/previews/countdown-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: 'docs/previews/countdown-desktop.png', fullPage: true });
  console.log('Сохранены превью таймера. Звук и звонки подменены тестовым сервером.');
} finally { await browser?.close(); server.kill(); }

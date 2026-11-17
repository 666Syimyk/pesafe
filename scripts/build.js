import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeConfig } from '../runtime-config.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await mkdir(path.join(dist, 'icons'), { recursive: true });
const assets = ['index.html', 'style.css', 'app.js', 'core.js', 'calls.js', 'storage.js', 'retention.js', 'recordings.js', 'privacy.js', 'sounds.js', 'countdown-audio.js', 'sensors.js', 'recorder.js', 'sw.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
await Promise.all(assets.map(file => copyFile(path.join(root, file), path.join(dist, file))));
let apiBase = '';
if (process.env.PESAFE_API_URL) {
  const url = new URL(process.env.PESAFE_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PESAFE_API_URL должен быть HTTPS origin, например https://pesafe.example.org');
  apiBase = url.origin;
}
await writeFile(path.join(dist, 'runtime-config.js'), `export const runtimeConfig = Object.freeze(${JSON.stringify({ ...runtimeConfig, apiBase })});\n`);
assets.push('runtime-config.js');
await writeFile(path.join(dist, 'build.json'), JSON.stringify({ version: '2.0.0', builtAt: new Date().toISOString(), assets }, null, 2));
console.log('Готово: dist/ — статические файлы, без .env, сервера и базы данных.');

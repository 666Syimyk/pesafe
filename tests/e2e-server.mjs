import http from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../server.js';
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'pesafe-e2e-'));
const app = await createApp({ dataDir, env: { ...process.env, DELIVERY_DRY_RUN: 'true' } });
const source = await readFile(new URL('../calls.js', import.meta.url), 'utf8');
const mocked = source + '\nbrowserDialer.open = uri => { (window.__pesafeCallRequests ||= []).push(uri); if (window.__blockPhoneTransport) throw new Error("Mocked browser block"); };\n';
const audioSource = await readFile(new URL('../countdown-audio.js', import.meta.url), 'utf8');
const mockedAudio = audioSource + String.raw`
audioEnvironment.createContext = () => {
  if (window.__audioMissing) throw new Error('Mock audio unavailable');
  const metrics = window.__soundMetrics ||= { starts: [], stopped: 0, active: 0, contexts: 0 }; metrics.contexts++;
  const context = { state: window.__audioLocked ? 'suspended' : 'running', get currentTime() { return Date.now() / 1000; }, destination: {},
    resume: async () => { if (window.__audioLocked) throw new Error('Mock autoplay block'); context.state = 'running'; context.onstatechange?.(); },
    suspend: async () => { context.state = 'suspended'; context.onstatechange?.(); },
    createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createOscillator: () => { const node = { active: false, frequency: { setValueAtTime(value) { node.hz = value; } }, connect() {}, disconnect() {}, start(at) { node.active = true; metrics.active++; metrics.starts.push({ hz: node.hz, at }); }, stop(at) { if (at === undefined && node.active) { node.active = false; metrics.active--; metrics.stopped++; } } }; return node; }
  }; return context;
};
`;
const server = http.createServer((req, res) => {
  if (new URL(req.url, 'http://localhost').pathname === '/countdown-audio.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(mockedAudio); }
  if (new URL(req.url, 'http://localhost').pathname === '/calls.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(mocked); }
  app.emit('request', req, res);
});
server.on('close', () => { app.emit('close'); rm(dataDir, { recursive: true, force: true }).catch(() => {}); });
server.listen(Number(process.env.PORT) || 8082, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));

// Локально созданные WAV: ничего не загружается с внешних сервисов.
export function alertSound(name = 'notice') {
  const rate = 16000, seconds = name === 'sos' ? 1.8 : .8, count = Math.floor(rate * seconds);
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const ascii = (offset, value) => [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) { const t = i / rate, envelope = Math.min(1, t * 20, (seconds - t) * 20), on = name === 'sos' ? t % .3 < .19 : true; const frequency = name === 'sos' ? 780 : t < .4 ? 660 : 880; view.setInt16(44 + i * 2, Math.sin(2 * Math.PI * frequency * t) * .2 * 32767 * envelope * Number(on), true); }
  return { blob: new Blob([buffer], { type: 'audio/wav' }), filename: `pesafe-${name}.wav` };
}

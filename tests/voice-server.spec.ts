import { test, expect } from '@playwright/test';
import { encodeVoiceWav } from '../lib/voice-wav';
import { decodeVoiceWav } from '../lib/local-asr';

test('浏览器采集的48kHz音频可转换成服务端接受的16kHz单声道WAV，保留声音', () => {
  const source = Float32Array.from({ length: 48000 }, (_, index) => .3 * Math.sin(index / 48000 * Math.PI * 2 * 440));
  const wav = Buffer.from(encodeVoiceWav([source.subarray(0, 22000), source.subarray(22000)], 48000));
  expect(wav.length).toBe(32044); expect(wav.readUInt32LE(24)).toBe(16000); const decoded = decodeVoiceWav(wav); expect(decoded.length).toBe(16000); expect(Math.max(...decoded)).toBeGreaterThan(.25);
  expect(() => decodeVoiceWav(Buffer.from('not audio'))).toThrow();
  expect(() => decodeVoiceWav(Buffer.from(encodeVoiceWav([new Float32Array(16000)], 16000)))).toThrow('没有听到清晰语音');
  const stereo = Buffer.from(wav); stereo.writeUInt16LE(2, 22); expect(() => decodeVoiceWav(stereo)).toThrow();
  const truncated = wav.subarray(0, wav.length - 1); expect(() => decodeVoiceWav(truncated)).toThrow();
});

test('语音接口要求有效账号，拒绝伪装、超长和静音录音，普通账号看不到存储诊断', async ({ request }) => {
  expect((await request.get('/api/voice/transcribe')).status()).toBe(401);
  await request.post('/api/auth/login', { data: { username: 'P01', password: '123456' } });
  const state = await request.get('/api/voice/transcribe?diagnostics=1'); expect(state.ok()).toBe(true); const status = await state.json(); expect(typeof status.available).toBe('boolean'); expect(status.storageFreeBytes).toBeUndefined();
  const send = (data: Buffer, contentType = 'audio/wav') => request.post('/api/voice/transcribe', { headers: { 'Content-Type': contentType, 'x-forwarded-for': crypto.randomUUID() }, data });
  expect((await send(Buffer.from('bad'))).status()).toBe(400);
  expect((await send(Buffer.from('{}'), 'application/json')).status()).toBe(400);
  expect((await send(Buffer.alloc(2_100_001))).status()).toBe(413);
  const silent = await send(Buffer.from(encodeVoiceWav([new Float32Array(16000)], 16000))); expect(silent.status()).toBe(422); expect((await silent.json()).error.code).toBe('SILENT_AUDIO');
});

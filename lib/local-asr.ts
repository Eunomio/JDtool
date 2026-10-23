import { fork, type ChildProcess } from 'node:child_process';
import { stat, statfs } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { AppError } from './errors';

let worker: ChildProcess | null = null;
let idle: ReturnType<typeof setTimeout> | undefined;
let active: { id: string; resolve: (text: string) => void; reject: (error: Error) => void } | null = null;
const currentRequest = () => active;
export const asrModelDirectory = () => process.env.ASR_MODEL_DIR || resolve('.local/asr-model');
export async function asrStatus(diagnostics = false) {
  const dir = asrModelDirectory();
  const model = await stat(join(dir, 'model.int8.onnx')).catch(() => null);
  const tokens = await stat(join(dir, 'tokens.txt')).catch(() => null);
  const result = { available: model?.size === 239233841 && !!tokens?.size, maxSeconds: 60 };
  if (!diagnostics) return result;
  const disk = await statfs(dir).catch(() => null);
  return { ...result, modelBytes: (model?.size || 0) + (tokens?.size || 0), maxAsrInstallBytes: 320 * 1024 * 1024, storageFreeBytes: disk ? disk.bavail * disk.bsize : null, storageTotalBytes: disk ? disk.blocks * disk.bsize : null };
}
export function decodeVoiceWav(buffer: Buffer) {
  if (buffer.length < 44 || buffer.length > 2_100_000 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new AppError(400, 'INVALID_AUDIO', '请重新录制语音。');
  let offset = 12; let format = false; let audio: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString('ascii', offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const start = offset + 8;
    if (size > buffer.length - start) throw new AppError(400, 'INVALID_AUDIO', '录音内容不完整，请重新录制。');
    if (name === 'fmt ') format = size >= 16 && buffer.readUInt16LE(start) === 1 && buffer.readUInt16LE(start + 2) === 1 && buffer.readUInt32LE(start + 4) === 16000 && buffer.readUInt16LE(start + 14) === 16;
    if (name === 'data') audio = buffer.subarray(start, start + size);
    offset = start + size + size % 2;
  }
  if (!format || !audio || audio.length % 2 || audio.length < 6400 || audio.length > 16000 * 2 * 61) throw new AppError(400, 'INVALID_AUDIO', '请录制1至60秒的清晰语音。');
  const samples = new Float32Array(audio.length / 2); let power = 0;
  for (let index = 0; index < samples.length; index++) { const value = audio.readInt16LE(index * 2) / 32768; samples[index] = value; power += value * value; }
  if (Math.sqrt(power / samples.length) < .001) throw new AppError(422, 'SILENT_AUDIO', '没有听到清晰语音，请靠近麦克风重录。');
  return samples;
}
export async function transcribeLocal(samples: Float32Array, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!(await asrStatus()).available) throw new AppError(503, 'VOICE_UNAVAILABLE', '语音输入暂时不可用，请稍后重试。');
  signal.throwIfAborted();
  if (active) throw new AppError(429, 'VOICE_BUSY', '正在识别其他录音，请稍后重试。');
  clearTimeout(idle);
  if (!worker || worker.killed) {
    const script = join(process.cwd(), 'scripts', 'asr-worker.cjs');
    const libraries = [resolve('node_modules/sherpa-onnx-linux-x64'), resolve('node_modules/sherpa-onnx-linux-x64/lib'), process.env.LD_LIBRARY_PATH || ''].join(delimiter);
    worker = fork(/* turbopackIgnore: true */ script, [], { windowsHide: true, execArgv: [], serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: { NODE_ENV: process.env.NODE_ENV || 'production', PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, LD_LIBRARY_PATH: libraries, ASR_MODEL_DIR: asrModelDirectory(), OMP_NUM_THREADS: '2' } });
    const child = worker;
    child.on('message', (message: { id?: string; text?: string; error?: boolean }) => { const request = currentRequest(); if (!request || request.id !== message.id) return; if (message.error) request.reject(new AppError(503, 'VOICE_FAILED', '这次语音未能识别，请重新录制。')); else request.resolve(String(message.text || '').slice(0, 12000)); });
    child.on('exit', () => { if (worker === child) { worker = null; active?.reject(new AppError(503, 'VOICE_FAILED', '这次识别中断，请重试。')); } });
    child.on('error', () => { if (worker === child) active?.reject(new AppError(503, 'VOICE_FAILED', '语音输入暂时不可用，请稍后重试。')); });
  }
  const id = crypto.randomUUID();
  let timeout: ReturnType<typeof setTimeout>;
  const stop = () => { worker?.kill(); worker = null; active?.reject(new AppError(408, 'VOICE_CANCELLED', '已停止语音识别。')); };
  try {
    return await new Promise<string>((resolve, reject) => { active = { id, resolve, reject }; timeout = setTimeout(stop, 90000); signal.addEventListener('abort', stop, { once: true }); worker!.send({ id, samples: samples.buffer }); });
  } finally { clearTimeout(timeout!); signal.removeEventListener('abort', stop); if (currentRequest()?.id === id) active = null; idle = setTimeout(() => { worker?.kill(); worker = null; }, 60000); idle.unref(); }
}

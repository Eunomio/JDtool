import { requireUser } from '../../../../lib/account-server';
import { AppError, errorResponse } from '../../../../lib/errors';
import { limitRequest } from '../../../../lib/usage';
import { asrStatus, decodeVoiceWav, transcribeLocal } from '../../../../lib/local-asr';

export const runtime = 'nodejs';
export const maxDuration = 100;
export async function GET(request: Request) {
  try { const user = await requireUser(request); return Response.json(await asrStatus(user.role === 'admin' && new URL(request.url).searchParams.has('diagnostics')), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    await requireUser(request); limitRequest(request);
    if (!/^audio\/wav(?:;|$)/i.test(request.headers.get('content-type') || '')) throw new AppError(400, 'INVALID_AUDIO', '请通过语音输入重新录制。');
    if (Number(request.headers.get('content-length')) > 2_100_000) throw new AppError(413, 'AUDIO_TOO_LARGE', '录音较长，请分段录入。');
    const reader = request.body?.getReader(); if (!reader) throw new AppError(400, 'INVALID_AUDIO', '没有收到录音，请重试。');
    const parts: Buffer[] = []; let size = 0;
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 2_100_000) throw new AppError(413, 'AUDIO_TOO_LARGE', '录音较长，请分段录入。'); parts.push(Buffer.from(chunk.value)); } } finally { await reader.cancel().catch(() => {}); }
    const text = await transcribeLocal(decodeVoiceWav(Buffer.concat(parts)), request.signal);
    if (!text.trim()) throw new AppError(422, 'NO_SPEECH', '没有识别到清晰文字，请重新录制。');
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export async function readJson(request: Request, maxBytes = 9_000_000): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new AppError(413, 'INPUT_TOO_LARGE', '内容过大，请减少图片或文字后重试。');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'EMPTY_INPUT', '请提供需要解析的内容。');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AppError(413, 'INPUT_TOO_LARGE', '内容过大，请减少图片或文字后重试。'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'INVALID_INPUT', '提交内容无法读取，请重新选择文件或粘贴文字。');
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
  return Response.json({ error: { code: 'REQUEST_FAILED', message: '暂时无法完成，请保留内容后重试。' } }, { status: 500 });
}

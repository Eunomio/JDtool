import { AppError } from './errors';
import { modelResponseError } from './model-errors';

export async function readModelStream(response: Response, signal: AbortSignal) {
  if (!response.body) throw new AppError(502, 'INVALID_RESULT', '没有得到完整结果，请重试。');
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let pending = ''; let content = ''; let size = 0; let finishReason: string | undefined; let done = false;
  async function frame(value: string) {
    const text = value.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!text) return;
    if (text === '[DONE]') { done = true; return; }
    let data;
    try { data = JSON.parse(text); } catch { throw new AppError(502, 'INVALID_RESULT', '返回内容不完整，请重试。'); }
    if (data.error) throw await modelResponseError(Response.json(data, { status: 503 }));
    const choice = data.choices?.[0];
    if (typeof choice?.delta?.content === 'string') content += choice.delta.content;
    else if (typeof choice?.message?.content === 'string') content = choice.message.content;
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  }
  try {
    while (!done && !finishReason) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) { pending += decoder.decode(); break; }
      size += value.byteLength;
      if (size > 4000000) throw new AppError(502, 'INCOMPLETE_RESULT', '返回内容较多，请重新分析。');
      pending += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        await frame(pending.slice(0, boundary.index).replace(/\r\n/g, '\n'));
        pending = pending.slice(boundary.index + boundary[0].length);
        if (done || finishReason) break;
      }
    }
    if (pending.trim() && !done && !finishReason) await frame(pending.replace(/\r\n/g, '\n'));
    signal.throwIfAborted();
    if (!finishReason) throw new AppError(502, 'INVALID_RESULT', '分析连接中断，请重新分析。');
    return { choices: [{ message: { content }, finish_reason: finishReason }] };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

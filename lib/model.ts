import { AppError } from './errors';
import { reserveModelCall } from './usage';

type Content = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
let activeCalls = 0;
export async function modelJson(system: string, content: Content, schema?: Record<string, unknown>, maxTokens = 6000, constrained = true) {
  const key = process.env.CHAT_ECNU_API_KEY;
  if (!key) throw new AppError(503, 'MODEL_UNAVAILABLE', '暂时无法解析，请稍后重试。你也可以保留原文继续整理。');
  if (activeCalls >= 4) throw new AppError(429, 'MODEL_BUSY', '正在处理其他内容，请稍后重试。');
  const base = process.env.CHAT_ECNU_BASE_URL || 'https://chat.ecnu.edu.cn/open/api/v1';
  activeCalls++;
  try {
    await reserveModelCall();
    const response = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CHAT_ECNU_MODEL || 'ecnu-plus', stream: false, temperature: 0.1,
        thinking: { type: 'disabled' }, max_tokens: maxTokens,
        messages: [{ role: 'system', content: schema && !constrained ? `${system}\n严格遵循以下JSON Schema：${JSON.stringify(schema)}` : system }, { role: 'user', content }],
        response_format: schema && constrained ? { type: 'json_schema', json_schema: { name: 'job_result', schema } } : { type: 'json_object' },
      }), signal: AbortSignal.timeout(150_000),
    });
    if (!response.ok) throw new AppError(response.status === 429 ? 429 : 502, 'MODEL_UNAVAILABLE', response.status === 429 ? '本次使用较多，请稍后重试。' : '暂时无法完成解析，已保留输入内容，请稍后重试。');
    const data = await response.json();
    if (data.choices?.[0]?.finish_reason === 'length') throw new AppError(502, 'INCOMPLETE_RESULT', '本次内容较长，请分成更清晰的截图或缩短正文后重试。');
    const result = data.choices?.[0]?.message?.content;
    if (typeof result !== 'string') throw new AppError(502, 'INVALID_RESULT', '没有得到完整结果，请重试。');
    try { return JSON.parse(result.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { throw new AppError(502, 'INVALID_RESULT', '解析结果不完整，请重试。'); }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(504, 'MODEL_TIMEOUT', '解析等待较久，请保留内容并重试。');
  } finally { activeCalls--; }
}

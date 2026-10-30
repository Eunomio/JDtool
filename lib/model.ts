import { AppError } from './errors';
import { reserveModelCall } from './usage';
import { AsyncLocalStorage } from 'node:async_hooks';
import { modelConfiguration } from './model-config';
import { modelResponseError } from './model-errors';
import { readModelStream } from './model-stream';

const requests = new AsyncLocalStorage<AbortSignal>();

export function modelRequestSignal() { return requests.getStore(); }

export async function withModelRequest<T>(request: Request, action: () => Promise<T>): Promise<T> {
  // One deadline covers reading inputs, generation, and the second factual check.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(140_000)]);
  return requests.run(signal, async () => {
    try {
      signal.throwIfAborted();
      const result = await action();
      if (request.signal.aborted) throw request.signal.reason;
      return result;
    } catch (error) {
      if (request.signal.aborted) throw new AppError(408, 'REQUEST_CANCELLED', '本次操作已取消，输入资料仍可继续使用。');
      if (signal.aborted && !(error instanceof AppError)) throw new AppError(504, 'MODEL_TIMEOUT', '本次等待较久，输入资料已保留，请稍后重试。');
      throw error;
    }
  });
}

type Content = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
let activeCalls = 0;
export async function withModelCall<T>(action: (signal: AbortSignal) => Promise<T>, externalSignal?: AbortSignal): Promise<T> {
  if (activeCalls >= 4) throw new AppError(429, 'MODEL_BUSY', '正在处理其他内容，请稍后重试。');
  const signal = AbortSignal.any([requests.getStore() || AbortSignal.timeout(140_000), AbortSignal.timeout(150_000), ...(externalSignal ? [externalSignal] : [])]);
  activeCalls++;
  try {
    signal.throwIfAborted();
    await reserveModelCall();
    signal.throwIfAborted();
    const result = await action(signal);
    signal.throwIfAborted();
    return result;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(504, 'MODEL_TIMEOUT', '解析等待较久，请保留内容并重试。');
  } finally { activeCalls--; }
}

export async function modelJson(system: string, content: Content, schema?: Record<string, unknown>, maxTokens = 6000, constrained = true, purpose: 'standard' | 'complex' = 'standard', externalSignal?: AbortSignal, streamResult = false) {
  const config = modelConfiguration();
  if (config.provider === 'chatecnu') {
    const images = Array.isArray(content) && content.some(item => item.type === 'image_url');
    if (images) config.model = process.env.CHAT_ECNU_VISION_MODEL?.trim() || 'ecnu-max';
    else if (purpose === 'complex') config.model = process.env.CHAT_ECNU_COMPLEX_MODEL?.trim() || 'ecnu-max';
  }
  const jsonSchema = config.provider === 'chatecnu' && constrained && !!schema;
  const instructions = `${system}${schema && !jsonSchema ? `\n严格遵循以下JSON Schema：${JSON.stringify(schema)}` : ''}\n只输出JSON，不要添加解释或代码围栏。`;
  return withModelCall(async (signal) => {
    const response = await fetch(`${config.base}/chat/completions`, {
      method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model, stream: streamResult, temperature: 0.1,
        ...(config.provider === 'bailian' ? { enable_thinking: false } : { thinking: { type: 'disabled' } }), max_tokens: maxTokens,
        messages: [{ role: 'system', content: instructions }, { role: 'user', content }],
        response_format: jsonSchema ? { type: 'json_schema', json_schema: { name: 'job_result', schema } } : { type: 'json_object' },
      }), signal,
    });
    if (!response.ok) {
      const error = await modelResponseError(response);
      console.warn('Model request failed', { provider: config.provider, purpose, status: response.status, code: error.code });
      throw error;
    }
    const data = streamResult && response.headers.get('content-type')?.includes('text/event-stream') ? await readModelStream(response, signal) : await response.json();
    if (data.choices?.[0]?.finish_reason === 'length') throw new AppError(502, 'INCOMPLETE_RESULT', '本次内容较长，请分成更清晰的截图或缩短正文后重试。');
    const result = data.choices?.[0]?.message?.content;
    if (typeof result !== 'string') throw new AppError(502, 'INVALID_RESULT', '没有得到完整结果，请重试。');
    try { return JSON.parse(result.replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { throw new AppError(502, 'INVALID_RESULT', '解析结果不完整，请重试。'); }
  }, externalSignal);
}

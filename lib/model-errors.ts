import { AppError } from './errors';

export async function modelResponseError(response: Response) {
  const reader = response.body?.getReader(); const decoder = new TextDecoder(); let text = ''; let size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 16384) { text = ''; break; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  let detail = '';
  try { const data = JSON.parse(text); detail = [data.error?.code, data.error?.type, data.error?.message, data.code, typeof data.detail === 'string' ? data.detail : ''].filter(value => typeof value === 'string').join(' '); } catch { /* Do not expose arbitrary upstream bodies. */ }
  if (/insufficient_quota|quota_exceeded|credit.?limit|weekly.?limit|额度不足|额度耗尽|配额已用完|余额不足/i.test(detail)) return new AppError(503, 'MODEL_QUOTA_EXHAUSTED', '分析服务的可用额度不足，请联系管理员处理。');
  if ([401, 403].includes(response.status)) return new AppError(503, 'MODEL_CONFIGURATION', '分析服务认证或访问权限异常，请联系管理员处理。');
  if (response.status === 429 || /rate_limit|concurrency|并发|请求过于频繁/i.test(detail)) return new AppError(429, 'MODEL_RATE_LIMITED', '当前分析请求较多，请稍后重试。');
  if (response.status === 413 || /context_length|maximum context|too many tokens|token.?limit|上下文过长/i.test(detail)) return new AppError(400, 'MODEL_INPUT_TOO_LONG', '本次资料较多，请减少补充资料后重试。');
  if ([400, 422].includes(response.status)) return new AppError(503, 'MODEL_CONFIGURATION', '分析服务暂时无法处理这份资料，请联系管理员检查。');
  return new AppError(502, 'MODEL_UNAVAILABLE', '暂时无法完成解析，已保留输入内容，请稍后重试。');
}

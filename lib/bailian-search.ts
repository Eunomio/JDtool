import { AppError } from './errors';
import { searchModelConfiguration } from './model-config';
import { withModelCall } from './model';

function searchError(status: number, code = '') {
  if (/AllocationQuota|FreeTier|Arrearage|Overdue|InsufficientBalance|QuotaExhausted/i.test(code)) return new AppError(503, 'SEARCH_QUOTA_EXHAUSTED', '搜索服务的可用额度已用完，请联系管理员处理。已保存的岗位与资料可以继续使用。');
  if (status === 429 || /Throttling|RateLimit/i.test(code)) return new AppError(429, 'SEARCH_RATE_LIMIT', '搜索请求较多，请稍后再试。已保存的岗位与资料可以继续使用。');
  if ([401, 403].includes(status) || /InvalidParameter|InvalidApiKey|InvalidModel|ModelNotFound|AccessDenied|Authentication/i.test(code)) return new AppError(503, 'SEARCH_CONFIGURATION', '搜索服务配置暂不可用，请联系管理员检查。已保存的岗位与资料可以继续使用。');
  return new AppError(502, 'SEARCH_UNAVAILABLE', '这次搜索未完成，请稍后重试。已保存的岗位与资料可以继续使用。');
}

async function responseError(response: Response) {
  const reader = response.body?.getReader(); let text = ''; let size = 0; const decoder = new TextDecoder();
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 16384) return searchError(response.status);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { const data = JSON.parse(text); const code = data.code || data.error?.code; return searchError(response.status, typeof code === 'string' ? code.slice(0, 160) : ''); }
    catch { return searchError(response.status); }
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
}

// Only provider search metadata supplies URLs. Assistant-generated links are never sources.
export async function bailianSearch(query: string, signal: AbortSignal): Promise<unknown[]> {
  const config = searchModelConfiguration();
  const textModel = /^deepseek-/i.test(config.model) || /^qwen-(?:turbo|plus|max)(?:-|$)/i.test(config.model);
  const endpoint = `${config.base.replace(/\/compatible-mode\/v1$/, '')}/api/v1/services/aigc/${textModel ? 'text-generation' : 'multimodal-generation'}/generation`;
  const prompt = `搜索以下公司与岗位相关的公开资料，优先官网，简短回答：${query}`;
  return withModelCall(async (requestSignal) => {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: requestSignal,
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', 'X-DashScope-SSE': 'enable' },
      body: JSON.stringify({
        model: config.model,
        input: { messages: [{ role: 'user', content: textModel ? prompt : [{ text: prompt }] }] },
        parameters: { enable_thinking: false, enable_search: true, incremental_output: true, ...(textModel ? { result_format: 'message' } : {}), max_tokens: 256, search_options: { search_strategy: 'turbo', forced_search: true, enable_source: true } },
      }),
    });
    const unavailable = () => searchError(response.status);
    if (!response.ok) throw await responseError(response);
    if (!response.body) throw unavailable();
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let pending = ''; let size = 0; const rows = new Map<string, Record<string, unknown>>();
    function frame(value: string) {
      const data = value.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let event;
      try { event = JSON.parse(data); } catch { throw unavailable(); }
      if (event.code || event.error) { const code = event.code || event.error?.code; throw searchError(response.status, typeof code === 'string' ? code.slice(0, 160) : ''); }
      const results = event.output?.search_info?.search_results;
      if (Array.isArray(results)) for (const result of results.slice(0, 12)) {
        if (result && typeof result === 'object' && typeof result.url === 'string' && (rows.has(result.url) || rows.size < 24)) rows.set(result.url, result);
      }
    }
    try {
      while (true) {
        requestSignal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) { pending += decoder.decode(); break; }
        size += value.byteLength;
        if (size > 1_500_000) throw unavailable();
        pending += decoder.decode(value, { stream: true });
        // CRLF may be split across network chunks; normalize only complete frames.
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(pending))) {
          frame(pending.slice(0, boundary.index).replace(/\r\n/g, '\n'));
          pending = pending.slice(boundary.index + boundary[0].length);
        }
      }
      if (pending.trim()) frame(pending.replace(/\r\n/g, '\n'));
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    return [...rows.values()].map(item => ({ title: item.title, url: item.url, snippet: '', requiresReading: true }));
  }, AbortSignal.any([signal, AbortSignal.timeout(45000)]));
}

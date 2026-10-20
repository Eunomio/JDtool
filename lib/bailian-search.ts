import { AppError } from './errors';
import { bailianConfiguration } from './model-config';
import { withModelCall } from './model';

// Only provider search metadata supplies URLs. Assistant-generated links are never sources.
export async function bailianSearch(query: string, signal: AbortSignal): Promise<unknown[]> {
  const config = bailianConfiguration();
  const endpoint = `${config.base.replace(/\/compatible-mode\/v1$/, '')}/api/v1/services/aigc/multimodal-generation/generation`;
  return withModelCall(async (requestSignal) => {
    const response = await fetch(endpoint, {
      method: 'POST', redirect: 'error', signal: requestSignal,
      headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', 'X-DashScope-SSE': 'enable' },
      body: JSON.stringify({
        model: config.model,
        input: { messages: [{ role: 'user', content: [{ text: `搜索以下公司与岗位相关的公开资料，优先官网，简短回答：${query}` }] }] },
        parameters: { enable_thinking: false, enable_search: true, incremental_output: true, max_tokens: 256, search_options: { search_strategy: 'turbo', forced_search: true, enable_source: true } },
      }),
    });
    const unavailable = () => new AppError(response.status === 429 ? 429 : 502, 'SEARCH_UNAVAILABLE', '这次搜索未完成，请稍后重试。已保存的岗位与资料可以继续使用。');
    if (!response.ok || !response.body) { await response.body?.cancel(); throw unavailable(); }
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let pending = ''; let size = 0; const rows: unknown[] = [];
    function frame(value: string) {
      const data = value.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let event;
      try { event = JSON.parse(data); } catch { throw unavailable(); }
      if (event.code || event.error) throw unavailable();
      const results = event.output?.search_info?.search_results;
      if (Array.isArray(results)) rows.push(...results.slice(0, 12));
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
    return rows.slice(0, 24).flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const item = row as Record<string, unknown>;
      return [{ title: item.title, url: item.url, snippet: '', requiresReading: true }];
    });
  }, AbortSignal.any([signal, AbortSignal.timeout(45000)]));
}

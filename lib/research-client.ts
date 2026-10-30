import type { ResearchEvent } from './company-research';
import { accountRequestHeaders } from './database';
import type { Source } from './database';

export async function streamResearch(job: unknown, signal: AbortSignal, onEvent: (event: ResearchEvent) => Promise<void> | void, sources?: Source[]) {
  const response = await fetch('/api/company/research', { method: 'POST', headers: { 'Content-Type': 'application/json', ...accountRequestHeaders() }, body: JSON.stringify({ job, ...(sources?.length ? { sources } : {}) }), signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
  if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.error?.message || '这次搜索尚未完成，请稍后重试。'); }
  if (!response.body) throw new Error('没有读到公司资料，请重试。');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let complete = false; let total = 0;
  async function consume(line: string) { if (!line.trim()) return; const event = JSON.parse(line) as ResearchEvent; if (event.type === 'heartbeat') return; if (event.type === 'error') throw new Error(event.message); await onEvent(event); if (event.type === 'result') complete = true; }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength; if (total > 1_500_000) throw new Error('本次资料较多，请稍后重试。');
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) await consume(line);
    }
    buffer += decoder.decode(); await consume(buffer);
    if (!complete) throw new Error('资料已保留，业务分析还未完成，请重试。');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

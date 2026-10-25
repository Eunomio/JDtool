import { z } from 'zod';
import { AppError } from './errors';
import { bailianSearch } from './bailian-search';
import { searchModelConfiguration } from './model-config';

export type SearchHit = { title: string; url: string; snippet: string; publishedAt?: string; requiresReading?: boolean };
const hit = z.object({ title: z.string().max(1000), url: z.string().max(4000), snippet: z.string().max(20000), publishedAt: z.string().max(200).optional(), requiresReading: z.literal(true).optional() });

export function searchConfiguration() {
  const provider = process.env.SEARCH_PROVIDER?.trim() || 'auto';
  if (['auto', 'bocha'].includes(provider) && process.env.BOCHA_API_KEY?.trim()) return { provider: 'bocha' as const, key: process.env.BOCHA_API_KEY.trim() };
  if (['auto', 'tavily'].includes(provider) && process.env.TAVILY_API_KEY?.trim()) return { provider: 'tavily' as const, key: process.env.TAVILY_API_KEY.trim() };
  if (provider === 'bailian' || (provider === 'auto' && process.env.DASHSCOPE_API_KEY?.trim())) return searchModelConfiguration();
  throw new AppError(503, 'SEARCH_UNAVAILABLE', '公司搜索暂时不可用。你可以先查看岗位、准备项目，也可补充公司官网资料后分析。');
}

export function normalizeHits(rows: unknown[]): SearchHit[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const parsed = hit.safeParse(row);
    if (!parsed.success) return [];
    const item = parsed.data;
    try {
      const url = new URL(item.url);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return [];
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (/^utm_|^(spm|from|ref)$/i.test(key)) url.searchParams.delete(key);
      if (seen.has(url.href) || !item.title.trim() || (!item.snippet.trim() && !item.requiresReading)) return [];
      seen.add(url.href);
      return [{ ...item, url: url.href }];
    } catch { return []; }
  }).slice(0, 10);
}

export async function webSearch(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const config = searchConfiguration();
  if (config.provider === 'bailian') return normalizeHits(await bailianSearch(query, signal));
  const response = await fetch(config.provider === 'bocha' ? 'https://api.bochaai.com/v1/web-search' : 'https://api.tavily.com/search', {
    method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(22000)]),
    headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(config.provider === 'bocha' ? { query, summary: true, freshness: 'noLimit', count: 6 } : { query, search_depth: 'basic', max_results: 6, include_answer: false, include_raw_content: false }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new AppError(response.status === 429 ? 429 : 502, 'SEARCH_UNAVAILABLE', '这次搜索未完成，请稍后重试。已保存的岗位与资料可以继续使用。'); }
  const reader = response.body?.getReader();
  let text = ''; let size = 0; const decoder = new TextDecoder();
  if (reader) try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1_500_000) throw new AppError(502, 'SEARCH_UNAVAILABLE', '搜索内容较多，请稍后重试。'); text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  let data;
  try { data = JSON.parse(text); } catch { throw new AppError(502, 'SEARCH_UNAVAILABLE', '暂时没有读到搜索结果，请重试。'); }
  if (config.provider === 'bocha' && data.code !== 200) throw new AppError(502, 'SEARCH_UNAVAILABLE', '暂时没有读到搜索结果，请重试。');
  const rows = config.provider === 'bocha' ? data.data?.webPages?.value : data.results;
  if (!Array.isArray(rows)) throw new AppError(502, 'SEARCH_UNAVAILABLE', '搜索结果不完整，请重试。');
  return normalizeHits(rows.slice(0, 12).map((item: Record<string, unknown>) => ({ title: item.name || item.title, url: item.url, snippet: item.summary || item.snippet || item.content, ...(typeof item.datePublished === 'string' || typeof item.published_date === 'string' ? { publishedAt: item.datePublished || item.published_date } : {}) })));
}

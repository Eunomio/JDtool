import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { researchCompany } from '../lib/company-research';
import { retryCompanyAnalysis } from '../lib/company-analysis';
import { modelJson } from '../lib/model';
import { AppError } from '../lib/errors';
import { assist } from '../lib/assistant';

const job = { id: 'fallback-job', company: '字节跳动', title: '产品经理', requirements: [{ id: 'r1', text: '了解视频产品' }] };
const quote = '字节跳动提供视频内容创作与剪辑产品。';
const source = { id: 's1', jobId: job.id, label: '官网', url: 'https://example.com/products', text: quote, collectedAt: '2026-10-30T00:00:00Z', kind: 'web' as const };
function result(sourceId: string) { return { identityMatched: true, identityNote: '公司相符', facts: [{ text: '提供视频创作产品', reason: '了解用户创作流程', requirementIds: ['r1'], sourceIds: [sourceId], quotes: [{ sourceId, quote }] }], businesses: [], roleInsights: [], hypotheses: [], questions: [] }; }
async function isolate() {
  const keys = ['APP_DATA_DIR', 'MODEL_PROVIDER', 'CHAT_ECNU_API_KEY', 'CHAT_ECNU_BASE_URL', 'CHAT_ECNU_MODEL', 'CHAT_ECNU_COMPLEX_MODEL', 'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'DASHSCOPE_COMPANY_MODEL', 'COMPANY_ANALYSIS_FALLBACK_PROVIDER'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])); const original = globalThis.fetch;
  await mkdir('.local', { recursive: true }); Object.assign(process.env, { APP_DATA_DIR: await mkdtemp('.local/company-fallback-'), MODEL_PROVIDER: 'chatecnu', CHAT_ECNU_API_KEY: 'test-ecnu', CHAT_ECNU_BASE_URL: 'https://ecnu.test.invalid', CHAT_ECNU_MODEL: 'ecnu-plus', CHAT_ECNU_COMPLEX_MODEL: 'ecnu-max', DASHSCOPE_API_KEY: 'test-bailian', DASHSCOPE_BASE_URL: 'https://bailian.test.invalid/compatible-mode/v1', DASHSCOPE_COMPANY_MODEL: 'deepseek-v4-flash-0731', COMPANY_ANALYSIS_FALLBACK_PROVIDER: 'bailian' });
  return () => { globalThis.fetch = original; for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; };
}

test('两个ECNU分析失败后才使用百炼，普通解析和复杂项目仍走原服务', async () => {
  const restore = await isolate(); const models: string[] = []; const urls: string[] = [];
  try {
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(String(options?.body)); models.push(body.model); urls.push(String(url));
      if (body.messages[1].content === '普通文字' || body.messages[1].content === '复杂项目') return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
      if (String(url).startsWith('https://ecnu.test.invalid')) return Response.json({ detail: '服务暂不可用' }, { status: 503 });
      expect(String(url)).toBe('https://bailian.test.invalid/compatible-mode/v1/chat/completions');
      expect(body.enable_search).toBeUndefined(); expect(body.search_options).toBeUndefined();
      expect(JSON.parse(body.messages[1].content).sources[0].id).toBe(source.id);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result(source.id)) } }] });
    };
    const data = await researchCompany({ job, sources: [source] }, () => {});
    expect(data.data.facts).toHaveLength(1); expect(models).toEqual(['ecnu-plus', 'ecnu-max', 'deepseek-v4-flash-0731']);
    await modelJson('只回JSON', '普通文字', undefined, 30); await modelJson('只回JSON', '复杂项目', undefined, 30, false, 'complex');
    expect(models.slice(-2)).toEqual(['ecnu-plus', 'ecnu-max']); expect(urls.slice(-2).every(url => url.startsWith('https://ecnu.test.invalid'))).toBe(true);
  } finally { restore(); }
});

test('百炼额度耗尽后停止，不更换模型也不继续重试', async () => {
  const restore = await isolate(); const models: string[] = [];
  try {
    globalThis.fetch = async (url, options) => { const body = JSON.parse(String(options?.body)); models.push(body.model); return String(url).startsWith('https://ecnu.test.invalid') ? Response.json({ detail: '暂不可用' }, { status: 503 }) : Response.json({ code: 'AllocationQuota.FreeTierOnly', message: 'private-provider-body' }, { status: 403 }); };
    await expect(researchCompany({ job, sources: [source] }, () => {})).rejects.toMatchObject({ code: 'MODEL_QUOTA_EXHAUSTED' });
    expect(models).toEqual(['ecnu-plus', 'ecnu-max', 'deepseek-v4-flash-0731']);
  } finally { restore(); }
});

test('未启用备用时只尝试两次ECNU，不能直接调用百炼分析用途', async () => {
  const restore = await isolate(); process.env.COMPANY_ANALYSIS_FALLBACK_PROVIDER = 'disabled'; let calls = 0;
  try {
    await expect(retryCompanyAnalysis(new AbortController().signal, async () => { calls++; throw new AppError(503, 'MODEL_UNAVAILABLE', '暂不可用'); })).rejects.toThrow('暂不可用');
    expect(calls).toBe(2); globalThis.fetch = async () => { throw Error('不应发送请求'); };
    await expect(modelJson('只回JSON', '公司资料', undefined, 30, false, 'company-fallback')).rejects.toMatchObject({ code: 'MODEL_CONFIGURATION' });
  } finally { restore(); }
});

test('关键词规划不可用时仍可搜索公开资料，并在分析时使用获准的备用', async () => {
  const restore = await isolate(); const queries: string[] = []; const purposes: unknown[] = [];
  try {
    const data = await researchCompany({ job }, () => {}, {
      search: async query => { queries.push(query); return [{ title: '官网', url: source.url, snippet: quote }]; },
      validate: async url => ({ url: new URL(url), addresses: [{ address: '93.184.216.34', family: 4 }] }),
      read: async url => ({ url, status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(`<html><body>${quote.repeat(20)}</body></html>`) }),
      json: async (_system, content, _schema, maxTokens, _constrained, purpose) => {
        purposes.push(purpose); if (maxTokens === 800) throw new AppError(429, 'MODEL_RATE_LIMITED', '请求较多');
        if (purpose !== 'company-fallback') throw new AppError(503, 'MODEL_UNAVAILABLE', '暂不可用');
        return result(JSON.parse(content as string).sources[0].id);
      },
    });
    expect(queries).toHaveLength(2); expect(queries.every(query => query.includes(job.company))).toBe(true);
    expect(purposes).toEqual(['standard', 'standard', 'complex', 'company-fallback']); expect(data.data.facts).toHaveLength(1);
  } finally { restore(); }
});

test('取消请求后不会继续调用百炼备用', async () => {
  const restore = await isolate(); const controller = new AbortController(); const attempts: number[] = [];
  try {
    await expect(retryCompanyAnalysis(controller.signal, async (_signal, attempt) => { attempts.push(attempt); if (attempt === 1) controller.abort(); throw new AppError(503, 'MODEL_UNAVAILABLE', '已取消'); })).rejects.toThrow('已取消');
    expect(attempts).toEqual([0, 1]);
  } finally { restore(); }
});

test('手动公司分析的百炼备用不携带个人项目或简历原文', async () => {
  const restore = await isolate(); let fallback = 0;
  try {
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://ecnu.test.invalid')) return Response.json({ detail: '暂不可用' }, { status: 503 });
      fallback++; const body = JSON.parse(String(options?.body)); const content = JSON.parse(body.messages[1].content);
      expect(Object.keys(content).sort()).toEqual(['action', 'job', 'sources']); expect(JSON.stringify(body)).not.toMatch(/private-project|private-resume/);
      return Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [{ text: '视频产品', reason: '业务理解', requirementIds: ['r1'], factIds: [], sourceIds: [source.id] }], hypotheses: [], questions: [] }) } }] });
    };
    await assist({ action: 'company', job: { ...job, content: '负责视频产品需求分析' }, sources: [source], text: 'private-resume', projects: [{ id: 'private-project', name: 'private-project', stage: '已测试', role: '产品', facts: [], confirmed: true }] });
    expect(fallback).toBe(1);
  } finally { restore(); }
});

test('两个ECNU返回的事实没有原文支撑时尝试百炼，仍坚持引用核对', async () => {
  const restore = await isolate(); const purposes: unknown[] = [];
  try {
    const data = await researchCompany({ job, sources: [source] }, () => {}, {
      search: async () => { throw Error('不应重新搜索'); }, read: async () => { throw Error('不应重新读取'); }, validate: async () => { throw Error('不应访问'); },
      json: async (_system, _content, _schema, _tokens, _constrained, purpose) => {
        purposes.push(purpose); const data = result(source.id);
        if (purpose !== 'company-fallback') data.facts[0].quotes[0].quote = '不存在于任何原文的错误引用';
        return data;
      },
    });
    expect(purposes).toEqual(['standard', 'complex', 'company-fallback']); expect(data.data.facts[0].sourceQuotes?.[0].quote).toBe(quote);
  } finally { restore(); }
});

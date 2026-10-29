import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { bailianSearch } from '../lib/bailian-search';

async function isolate() {
  const keys = ['APP_DATA_DIR', 'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'DASHSCOPE_SEARCH_MODEL', 'DAILY_MODEL_REQUEST_LIMIT'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])); const original = globalThis.fetch;
  await mkdir('.local', { recursive: true });
  Object.assign(process.env, { APP_DATA_DIR: await mkdtemp('.local/search-provider-'), DASHSCOPE_API_KEY: 'test-only-search-provider', DASHSCOPE_BASE_URL: 'https://provider.test.invalid/compatible-mode/v1', DASHSCOPE_SEARCH_MODEL: 'deepseek-v4-flash-0731', DAILY_MODEL_REQUEST_LIMIT: '20' });
  return () => { globalThis.fetch = original; for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; };
}

for (const [model, endpoint] of [['qwen3.8-flash', 'multimodal-generation'], ['deepseek-v4-flash-0731', 'text-generation'], ['qwen-plus', 'text-generation']]) {
  test(`${model}搜索使用对应接口及消息格式，保留真实来源`, async () => {
    const restore = await isolate(); process.env.DASHSCOPE_SEARCH_MODEL = model;
    try {
      globalThis.fetch = async (url, options) => {
        expect(String(url)).toBe(`https://provider.test.invalid/api/v1/services/aigc/${endpoint}/generation`);
        const body = JSON.parse(String(options?.body)); expect(body.model).toBe(model);
        if (endpoint === 'text-generation') { expect(typeof body.input.messages[0].content).toBe('string'); expect(body.parameters.result_format).toBe('message'); }
        else expect(body.input.messages[0].content).toEqual([{ text: expect.stringContaining('科大讯飞') }]);
        expect(body.parameters).toMatchObject({ enable_search: true, enable_thinking: false, search_options: { forced_search: true, enable_source: true } });
        return new Response(`data:${JSON.stringify({ output: { search_info: { search_results: [{ title: '公司官网', url: 'https://example.com/business' }] }, choices: [{ message: { content: '自行生成的链接 https://fake.test.invalid/' } }] } })}\n\n`);
      };
      expect(await bailianSearch('科大讯飞 官网业务', new AbortController().signal)).toEqual([{ title: '公司官网', url: 'https://example.com/business', snippet: '', requiresReading: true }]);
    } finally { restore(); }
  });
}

for (const item of [
  { name: '流内地址不匹配', status: 200, upstream: 'InvalidParameter', expected: 'SEARCH_CONFIGURATION', message: '配置暂不可用' },
  { name: 'HTTP免费额度用尽', status: 403, upstream: 'AllocationQuota.FreeTierOnly', expected: 'SEARCH_QUOTA_EXHAUSTED', message: '可用额度已用完' },
  { name: '流内免费额度用尽', status: 200, upstream: 'AllocationQuota.FreeTierOnly', expected: 'SEARCH_QUOTA_EXHAUSTED', message: '可用额度已用完' },
  { name: '请求过多', status: 429, upstream: 'Throttling.RateQuota', expected: 'SEARCH_RATE_LIMIT', message: '请求较多' },
  { name: '密钥无效', status: 401, upstream: 'InvalidApiKey', expected: 'SEARCH_CONFIGURATION', message: '配置暂不可用' },
]) {
  test(`${item.name}有明确提示，不泄露服务商正文或切换模型`, async () => {
    const restore = await isolate(); let calls = 0;
    try {
      globalThis.fetch = async () => {
        calls++; const error = { code: item.upstream, message: `secret test-only-search-provider private-provider-body` };
        return new Response(item.status === 200 ? `data:${JSON.stringify(error)}\n\n` : JSON.stringify(error), { status: item.status });
      };
      const error = await bailianSearch('科大讯飞 官网', new AbortController().signal).catch(error => error);
      expect(error.code).toBe(item.expected); expect(error.message).toContain(item.message);
      expect(error.message).not.toMatch(/test-only-search-provider|private-provider-body|secret/); expect(calls).toBe(1);
    } finally { restore(); }
  });
}

test('异常的大段错误正文有大小限制，并停止读取', async () => {
  const restore = await isolate(); let cancelled = false;
  try {
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { cancelled = true; } }), { status: 503 });
    await expect(bailianSearch('科大讯飞 官网', new AbortController().signal)).rejects.toMatchObject({ code: 'SEARCH_UNAVAILABLE' });
    expect(cancelled).toBe(true);
  } finally { restore(); }
});

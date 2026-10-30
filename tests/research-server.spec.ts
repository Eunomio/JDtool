import { test, expect } from '@playwright/test';
import { researchStream } from '../lib/research-stream';
import { companySources } from '../lib/company-context';
import { researchCompany, researchInput, type ResearchEvent } from '../lib/company-research';
import { AppError } from '../lib/errors';
import { assist } from '../lib/assistant';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { retryCompanyAnalysis } from '../lib/company-analysis';
import { modelResponseError } from '../lib/model-errors';

const job = { id: 'research-check', company: '云帆科技', title: '产品经理', requirements: [{ id: 'r1', text: '分析客户需求' }] };
const quote = '云帆科技为企业客户提供项目协作和需求管理产品。';
const advice = { text: '提供企业协作产品', reason: '了解客户需求与协作流程', sourceIds: ['s1'], requirementIds: ['r1'], quotes: [{ sourceId: 's1', quote }] };
const result = { facts: [advice], businesses: [], roleInsights: [advice], hypotheses: [], questions: [], identityMatched: true, identityNote: '官网主体相符' };

test('业务分析等待时持续返回保活消息，最终结果仍可正常读取', async () => {
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  const stream = researchStream(new AbortController().signal, async (_signal, emit) => {
    emit({ type: 'progress', stage: 'analyzing', message: '正在分析' });
    await waiting;
    emit({ type: 'result', data: { facts: [], questions: [], hypotheses: [] } });
  }, 20);
  const reader = stream.getReader();
  const read = async () => {
    const chunk = await reader.read();
    expect(chunk.done).toBe(false);
    return JSON.parse(new TextDecoder().decode(chunk.value!));
  };
  try {
    expect((await read()).stage).toBe('analyzing');
    for (let index = 0; index < 3; index++) expect(await read()).toEqual({ type: 'heartbeat' });
    finish();
    expect((await read()).type).toBe('result');
    expect((await reader.read()).done).toBe(true);
  } finally { finish(); await reader.cancel(); }
});

test('取消研究会通知上游停止，关闭连接后不再发送保活消息', async () => {
  let cancelled = false;
  const stream = researchStream(new AbortController().signal, async (signal, emit) => {
    emit({ type: 'progress', stage: 'searching', message: '正在搜索' });
    await new Promise<void>(resolve => signal.addEventListener('abort', () => { cancelled = true; resolve(); }, { once: true }));
    emit({ type: 'error', message: '取消后不应再发送' });
  }, 20);
  const reader = stream.getReader();
  await reader.read(); await reader.cancel();
  expect(cancelled).toBe(true);
  expect((await reader.read()).done).toBe(true);
});

test('分析超时明确提示资料已保存，并提供继续分析的位置', async () => {
  const stream = researchStream(new AbortController().signal, async (_signal, emit) => {
    emit({ type: 'progress', stage: 'analyzing', message: '正在分析' });
    throw new AppError(504, 'MODEL_TIMEOUT', 'test-only-private-provider-message');
  });
  const events = (await new Response(stream).text()).trim().split('\n').map(line => JSON.parse(line));
  expect(events.at(-1).type).toBe('error');
  expect(events.at(-1).message).toContain('公司资料已保存');
  expect(events.at(-1).message).toContain('重新分析');
  expect(JSON.stringify(events)).not.toContain('test-only-private-provider-message');
});

test('公司分析只发送相关原文摘录，保留所有来源和完整网页资料', () => {
  const sources = Array.from({ length: 4 }, (_, index) => ({ id: `s${index}`, url: `https://example.com/${index}`, text: '页脚导航内容。'.repeat(900) + quote.repeat(15) + '其他站点链接。'.repeat(1000) }));
  const originals = structuredClone(sources);
  const selected = companySources(job, sources);
  expect(selected.map(source => source.id)).toEqual(originals.map(source => source.id));
  expect(selected.map(source => source.text).join('').length).toBeLessThanOrEqual(12000);
  for (const source of selected) {
    expect(source.text).toContain(quote);
    for (const excerpt of source.text.split('\n')) expect(originals.find(original => original.id === source.id)!.text).toContain(excerpt);
  }
  expect(sources).toEqual(originals);
});

test('公司主体不明或当天额度耗尽时保留具体原因', async () => {
  for (const [code, message] of [['COMPANY_UNCERTAIN', '请核对公司全称'], ['DAILY_LIMIT', '今天的使用次数已达到上限']]) {
    const stream = researchStream(new AbortController().signal, async (_signal, emit) => {
      emit({ type: 'progress', stage: 'analyzing', message: '正在分析' });
      throw new AppError(422, code, message);
    });
    const events = (await new Response(stream).text()).trim().split('\n').map(line => JSON.parse(line));
    expect(events.at(-1)).toEqual({ type: 'error', message });
  }
});

test('自动研究保存完整来源，用摘录生成分析并按完整原文核对引用', async () => {
  const previous = { SEARCH_PROVIDER: process.env.SEARCH_PROVIDER, DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY };
  process.env.SEARCH_PROVIDER = 'bailian'; process.env.DASHSCOPE_API_KEY = 'test-only-research';
  let calls = 0; const events: ResearchEvent[] = [];
  try {
    await researchCompany({ job }, event => events.push(event), {
      search: async () => [{ title: '云帆科技官网', url: 'https://example.com/company', snippet: '', requiresReading: true }],
      validate: async url => ({ url: new URL(url), addresses: [{ address: '93.184.216.34', family: 4 }] }),
      read: async url => ({ status: 200, headers: { 'content-type': 'text/html' }, url, body: Buffer.from(`<html><body>${quote.repeat(400)}</body></html>`) }),
      json: async (_system, content, _schema, _limit, _constrained, purpose) => {
        if (++calls === 1) return { keywords: ['主营业务'] };
        expect(purpose).toBe('standard');
        const { sources } = JSON.parse(content as string);
        expect(sources[0].text.length).toBeLessThanOrEqual(2400);
        return { ...result, facts: [{ ...advice, sourceIds: [sources[0].id], quotes: [{ sourceId: sources[0].id, quote }] }], roleInsights: [] };
      },
    });
    const saved = events.find(event => event.type === 'sources');
    expect(saved?.type === 'sources' && saved.sources[0].text.length).toBeGreaterThan(5000);
    const analyzed = events.find(event => event.type === 'result');
    expect(analyzed?.type === 'result' && analyzed.data.facts).toHaveLength(1);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('分析已保存资料优先使用ecnu-plus及原文摘录，不重新搜索', async () => {
  const keys = ['MODEL_PROVIDER', 'CHAT_ECNU_API_KEY', 'CHAT_ECNU_BASE_URL', 'CHAT_ECNU_MODEL', 'CHAT_ECNU_COMPLEX_MODEL', 'APP_DATA_DIR'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const original = globalThis.fetch; let calls = 0;
  await mkdir('.local', { recursive: true });
  Object.assign(process.env, { MODEL_PROVIDER: 'chatecnu', CHAT_ECNU_API_KEY: 'test-only-research', CHAT_ECNU_BASE_URL: 'https://research.test.invalid', CHAT_ECNU_MODEL: 'ecnu-plus', CHAT_ECNU_COMPLEX_MODEL: 'ecnu-max', APP_DATA_DIR: await mkdtemp('.local/research-retry-') });
  const source = { id: 's1', label: '官网资料', text: quote.repeat(400) };
  try {
    globalThis.fetch = async (url, options) => {
      calls++; expect(String(url)).toBe('https://research.test.invalid/chat/completions');
      const body = JSON.parse(String(options?.body)); expect(body.model).toBe('ecnu-plus'); expect(body.stream).toBe(true); expect(body.response_format.type).toBe('json_object');
      expect(JSON.parse(body.messages[1].content).sources[0].text.length).toBeLessThanOrEqual(2400);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ facts: [{ ...advice, factIds: [] }], hypotheses: [], questions: [] }) } }] });
    };
    const analyzed = await assist({ action: 'company', job: { ...job, content: '负责人工智能产品需求分析' }, sources: [source] }) as { facts: unknown[] };
    expect(analyzed.facts).toHaveLength(1); expect(calls).toBe(1); expect(source.text.length).toBeGreaterThan(5000);
  } finally {
    globalThis.fetch = original;
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('单次分析超时后只重试一次，重试使用独立信号并保留整体取消', async () => {
  const original = AbortSignal.timeout; const parent = new AbortController(); let calls = 0; let retries = 0;
  const first = new AbortController();
  AbortSignal.timeout = milliseconds => milliseconds === 75000 && !calls ? first.signal : original(milliseconds);
  try {
    const analyzed = await retryCompanyAnalysis(parent.signal, async signal => {
      if (++calls === 1) return await new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new AppError(504, 'MODEL_TIMEOUT', '第一次超时')), { once: true });
        first.abort();
      });
      expect(signal.aborted).toBe(false); expect(parent.signal.aborted).toBe(false); return '分析完成';
    }, () => retries++);
    expect(analyzed).toBe('分析完成'); expect(calls).toBe(2); expect(retries).toBe(1);
    calls = 0;
    await expect(retryCompanyAnalysis(parent.signal, async () => { calls++; throw new AppError(504, 'MODEL_TIMEOUT', '再次超时'); })).rejects.toThrow('再次超时');
    expect(calls).toBe(2);
  } finally { AbortSignal.timeout = original; }
});

test('用户取消、权限错误或额度用尽不会发起分析重试', async () => {
  for (const code of ['DAILY_LIMIT', 'MODEL_BUSY', 'FORBIDDEN', 'MODEL_CONFIGURATION', 'MODEL_QUOTA_EXHAUSTED', 'MODEL_INPUT_TOO_LONG']) {
    let calls = 0;
    await expect(retryCompanyAnalysis(new AbortController().signal, async () => { calls++; throw new AppError(429, code, '停止处理'); })).rejects.toThrow('停止处理');
    expect(calls).toBe(1);
  }
  const controller = new AbortController(); let calls = 0;
  await expect(retryCompanyAnalysis(controller.signal, async signal => { calls++; controller.abort(); expect(signal.aborted).toBe(true); throw new AppError(504, 'MODEL_TIMEOUT', '已取消'); })).rejects.toThrow('已取消');
  expect(calls).toBe(1);
});

const savedSource = { id: 's1', jobId: job.id, label: '官网', url: 'https://example.com/about', text: quote, collectedAt: '2026-10-30T00:00:00Z', kind: 'web' as const };

test('重新分析只复用所选岗位的已保存资料，不规划关键词、不搜索、不重复读网页', async () => {
  const events: ResearchEvent[] = []; let calls = 0;
  const analyzed = await researchCompany(researchInput.parse({ job, sources: [savedSource] }), event => events.push(event), {
    search: async () => { throw Error('不应再次搜索'); },
    read: async () => { throw Error('不应再次读取'); },
    validate: async () => { throw Error('不应访问网络'); },
    json: async (_system, content, _schema, _limit, _constrained, purpose) => { calls++; expect(purpose).toBe('standard'); expect(JSON.parse(content as string).sources[0].id).toBe(savedSource.id); return result; },
  });
  expect(calls).toBe(1); expect(analyzed.data.facts).toHaveLength(1); expect(analyzed.data.research?.company).toBe(job.company);
  expect(events.filter(event => event.type === 'progress').every(event => event.type === 'progress' && event.stage === 'analyzing')).toBe(true);
});

test('复用资料拒绝其他岗位、重复编号、非法链接、过长正文和超出数量的来源', () => {
  const variants = [
    [{ ...savedSource, jobId: 'another-job' }], [savedSource, savedSource], [{ ...savedSource, url: 'javascript:alert(1)' }], [{ ...savedSource, url: 'https://user:secret@example.com/' }], [{ ...savedSource, text: '字'.repeat(14001) }],
    Array.from({ length: 7 }, (_, index) => ({ ...savedSource, id: `s${index}` })),
  ];
  for (const sources of variants) expect(researchInput.safeParse({ job, sources }).success).toBe(false);
});

test('自动分析遇到限流后改用另一分析模型，继续核对原文引用', async () => {
  const purposes: unknown[] = [];
  const analyzed = await researchCompany({ job, sources: [savedSource] }, () => {}, {
    search: async () => { throw Error('不应搜索'); }, read: async () => { throw Error('不应读取'); }, validate: async () => { throw Error('不应访问'); },
    json: async (_system, _content, _schema, _limit, _constrained, purpose) => { purposes.push(purpose); if (purposes.length === 1) throw new AppError(429, 'MODEL_RATE_LIMITED', '请求较多'); return result; },
  });
  expect(purposes).toEqual(['standard', 'complex']); expect(analyzed.data.facts).toHaveLength(1); expect(analyzed.data.facts[0].sourceQuotes?.[0].quote).toBe(quote);
});

test('手动分析限流时仅在ChatECNU内从plus重试max，保存同一份资料', async () => {
  const keys = ['MODEL_PROVIDER', 'CHAT_ECNU_API_KEY', 'CHAT_ECNU_BASE_URL', 'CHAT_ECNU_MODEL', 'CHAT_ECNU_COMPLEX_MODEL', 'APP_DATA_DIR'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])); const original = globalThis.fetch; const models: string[] = [];
  await mkdir('.local', { recursive: true }); Object.assign(process.env, { MODEL_PROVIDER: 'chatecnu', CHAT_ECNU_API_KEY: 'test-retry-key', CHAT_ECNU_BASE_URL: 'https://retry.test.invalid', CHAT_ECNU_MODEL: 'ecnu-plus', CHAT_ECNU_COMPLEX_MODEL: 'ecnu-max', APP_DATA_DIR: await mkdtemp('.local/company-model-') });
  try {
    globalThis.fetch = async (url, options) => {
      expect(String(url)).toBe('https://retry.test.invalid/chat/completions'); const body = JSON.parse(String(options?.body)); models.push(body.model);
      expect(JSON.parse(body.messages[1].content).sources[0].id).toBe(savedSource.id);
      return models.length === 1 ? Response.json({ detail: '并发请求过多 private-provider-body' }, { status: 429 }) : Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [{ ...advice, factIds: [] }], hypotheses: [], questions: [] }) } }] });
    };
    const analyzed = await assist({ action: 'company', job: { ...job, content: '负责产品需求分析' }, sources: [savedSource] }) as { facts: unknown[] };
    expect(models).toEqual(['ecnu-plus', 'ecnu-max']); expect(analyzed.facts).toHaveLength(1);
  } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('分析服务错误区分并发、额度、认证和资料长度，隐藏上游正文', async () => {
  for (const [status, detail, code] of [[429, '并发请求过多', 'MODEL_RATE_LIMITED'], [429, 'insufficient_quota', 'MODEL_QUOTA_EXHAUSTED'], [401, '无效令牌', 'MODEL_CONFIGURATION'], [403, '客户端IP不在白名单', 'MODEL_CONFIGURATION'], [400, 'context_length_exceeded', 'MODEL_INPUT_TOO_LONG'] ] as const) {
    const error = await modelResponseError(Response.json({ detail: `${detail} private-provider-body test-key` }, { status }));
    expect(error.code).toBe(code); expect(error.message).not.toMatch(/private-provider-body|test-key/);
  }
});

test('分析服务错误正文超长时停止读取，返回可理解的提示', async () => {
  let cancelled = false;
  const error = await modelResponseError(new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(17000)); }, cancel() { cancelled = true; } }), { status: 502 }));
  expect(error.code).toBe('MODEL_UNAVAILABLE'); expect(cancelled).toBe(true);
});

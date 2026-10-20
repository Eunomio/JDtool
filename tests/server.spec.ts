import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { api, displayText, displayProjectText } from '../lib/client';
import { POST as recommend } from '../app/api/project-recommendations/route';
import { modelJson, withModelRequest } from '../lib/model';
import type { Project, RecommendationResult } from '../lib/database';
import { researchCompany, groundResearch, type ResearchEvent } from '../lib/company-research';
import { normalizeHits, webSearch } from '../lib/web-search';
import { assist } from '../lib/assistant';

async function isolateModel() {
  const original = { key: process.env.CHAT_ECNU_API_KEY, base: process.env.CHAT_ECNU_BASE_URL, directory: process.env.APP_DATA_DIR, limit: process.env.DAILY_MODEL_REQUEST_LIMIT };
  await mkdir('.local', { recursive: true });
  process.env.CHAT_ECNU_API_KEY = 'test-only-placeholder';
  process.env.CHAT_ECNU_BASE_URL = 'https://model.test.invalid';
  process.env.APP_DATA_DIR = await mkdtemp('.local/model-regression-');
  process.env.DAILY_MODEL_REQUEST_LIMIT = '200';
  return () => { for (const [name, value] of [['CHAT_ECNU_API_KEY', original.key], ['CHAT_ECNU_BASE_URL', original.base], ['APP_DATA_DIR', original.directory], ['DAILY_MODEL_REQUEST_LIMIT', original.limit]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; } };
}

test('公开网页读取接口从第16个请求起返回429', async ({ request }) => {
  const key = crypto.randomUUID();
  const statuses = [];
  for (let count = 0; count < 20; count++) statuses.push((await request.post('/api/sources/extract', { headers: { 'x-forwarded-for': key }, data: { url: 'http://127.0.0.1/' } })).status());
  expect(statuses).toEqual([...Array(15).fill(400), ...Array(5).fill(429)]);
});

test('复盘缺少实际追问时在调用模型前拒绝请求', async ({ request }) => {
  const response = await request.post('/api/assist', { headers: { 'x-forwarded-for': crypto.randomUUID() }, data: { action: 'interview', stage: 'review', job: { id: 'j1', title: '后端开发', company: '测试公司', content: '负责事务处理' }, answer: '确定事务范围', supplement: '控制隔离级别' } });
  expect(response.status()).toBe(400); expect((await response.json()).error.code).toBe('MISSING_FOLLOWUP');
});

test('生成与事实核对共用截止时间，核对超时仍保存待核对草稿', async () => {
  const restoreEnv = await isolateModel();
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const timers: { milliseconds: number; controller: AbortController }[] = [];
  let upstreamCalls = 0;
  let auditSignal: AbortSignal | undefined;
  const data = { recommendations: [{ projectId: 'p1', rank: 1, role: 'primary', matchType: 'direct', requirementIds: ['r1'], factIds: ['f1'], reason: '事务相关', resumeBullets: [{ text: '实现事务处理', factIds: ['f1'] }], interviewOutline: [] }], gaps: [], needsReview: [] };
  try {
    AbortSignal.timeout = (milliseconds) => { const controller = new AbortController(); timers.push({ milliseconds, controller }); return controller.signal; };
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('/api/')) return recommend(new Request('http://localhost/api/project-recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': crypto.randomUUID() }, body: options?.body, signal: options?.signal }));
      upstreamCalls++;
      if (upstreamCalls === 1) return Response.json({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason: 'stop' }] });
      auditSignal = options?.signal || undefined;
      return new Promise<Response>((_, reject) => {
        auditSignal!.addEventListener('abort', () => reject(auditSignal!.reason), { once: true });
        queueMicrotask(() => timers.find((timer) => timer.milliseconds === 140_000)!.controller.abort(new DOMException('deadline', 'TimeoutError')));
      });
    };
    const result = await api<RecommendationResult>('/api/project-recommendations', { job: { id: 'j1', title: '后端开发', company: '测试公司', content: '负责事务处理', requirements: [{ id: 'r1', text: '负责事务处理' }] }, projects: [{ id: 'p1', name: '事务项目', stage: '已测试', role: '开发', facts: [{ id: 'f1', text: '实现事务处理' }], confirmed: true }] });
    expect(upstreamCalls).toBe(2); expect(auditSignal?.aborted).toBe(true);
    expect(timers.filter((timer) => timer.milliseconds === 140_000)).toHaveLength(1);
    expect(timers.find((timer) => timer.milliseconds === 180_000)?.controller.signal.aborted).toBe(false);
    expect(result.recommendations[0].resumeBullets).toEqual([]);
    expect(result.needsReview).toContain('实现事务处理（本次尚未完成事实核对）');
  } finally { globalThis.fetch = originalFetch; AbortSignal.timeout = originalTimeout; restoreEnv(); }
});

test('取消一个请求会停止上游调用，并且不影响其他用户的调用', async () => {
  const restoreEnv = await isolateModel(); const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  const pending: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  let ready!: () => void; const started = new Promise<void>((resolve) => { ready = resolve; });
  try {
    globalThis.fetch = (_url, options) => new Promise<Response>((resolve, reject) => {
      const signal = options!.signal!; pending.push({ signal, resolve });
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      if (pending.length === 2) ready();
    });
    const cancelled = withModelRequest(new Request('http://test/a', { signal: controller.signal }), () => modelJson('测试', 'A'));
    const normal = withModelRequest(new Request('http://test/b'), () => modelJson('测试', 'B'));
    const cancelledResult = cancelled.catch((error) => error);
    await started; controller.abort();
    expect((await cancelledResult).code).toBe('REQUEST_CANCELLED');
    expect(pending[0].signal.aborted).toBe(true); expect(pending[1].signal.aborted).toBe(false);
    pending[1].resolve(Response.json({ choices: [{ message: { content: '{"ok":true}' } }] }));
    expect(await normal).toEqual({ ok: true });
  } finally { globalThis.fetch = originalFetch; restoreEnv(); }
});

test('脱敏替换反复展示不会重复扩展已替换的名称', () => {
  const project = { visibility: 'display', redactions: [{ from: '海鸥', to: '某海鸥产品' }] } as Project;
  const once = displayText('参与海鸥开发', project);
  expect(once).toBe('参与某海鸥产品开发'); expect(displayText(once, project)).toBe(once);
  expect(displayProjectText(once, [project])).toBe(once);
  const multiple = { ...project, redactions: [{ from: '海鸥', to: '张三' }, { from: '张三', to: '求职者' }] };
  expect(displayText('张三负责项目', multiple)).toBe('求职者负责项目');
  expect(displayText('使用产品[a]', { ...project, redactions: [{ from: '产品[a]', to: '某产品' }] })).toBe('使用某产品');
});

test('搜索结果规范化会去重并拒绝脚本与带凭据链接', () => {
  const row = { title: '产品介绍', snippet: '公司为企业提供项目协作服务。' };
  expect(normalizeHits([{ ...row, url: 'javascript:alert(1)' }, { ...row, url: 'https://u:secret@example.com/' }, { ...row, url: 'https://example.com/a?utm_source=x#top' }, { ...row, url: 'https://example.com/a' }])).toEqual([{ ...row, url: 'https://example.com/a' }]);
});

test('公司研究过滤不可访问来源与虚构引用，读取失败的来源保留摘要标记', async () => {
  const key = process.env.TAVILY_API_KEY; process.env.TAVILY_API_KEY = 'test-only-search';
  const job = { id: 'company-job', company: '云帆科技', title: '产品经理', requirements: [{ id: 'r1', text: '分析企业协作需求' }] };
  const events: ResearchEvent[] = []; let calls = 0; let searched = 0;
  const deps = {
    search: async () => { searched++; return [{ title: '公司介绍', url: 'https://example.com/about', snippet: '云帆科技为企业提供项目协作服务。' }, { title: '产品介绍', url: 'https://example.org/product', snippet: '云帆科技提供企业协作产品与需求管理工具。' }, { title: '内网结果', url: 'http://127.0.0.1/internal', snippet: '不应送去分析' }]; },
    validate: async (input: string) => { if (input.includes('127.0.0.1')) throw new Error('private'); return { url: new URL(input), addresses: [{ address: '93.184.216.34', family: 4 }] }; },
    read: async (input: string) => { if (input.includes('example.org')) throw new Error('unavailable'); return { status: 200, headers: { 'content-type': 'text/html' }, url: input, body: Buffer.from(`<html><body>${'云帆科技为企业提供项目协作服务。'.repeat(20)}</body></html>`) }; },
    json: (async (_system: string, content: unknown) => {
      calls++; if (calls === 1) return { keywords: ['官网 公司业务', '协作产品 需求管理'] };
      const { sources } = JSON.parse(content as string); expect(sources).toHaveLength(2); expect(sources.some((row: {url:string}) => row.url.includes('127.0.0.1'))).toBe(false);
      const grounded = { text: '提供企业项目协作服务', reason: '了解目标客户的工作流程', requirementIds: ['r1', 'fake-r'], sourceIds: [sources[0].id], quotes: [{ sourceId: sources[0].id, quote: '云帆科技为企业提供项目协作服务。' }] };
      return { identityMatched: true, identityNote: '公司名称一致', facts: [grounded, { ...grounded, text: '虚构增长数字', quotes: [{ sourceId: sources[0].id, quote: '营收增长百分之五十' }] }], businesses: [], roleInsights: [grounded], hypotheses: [], questions: [] };
    }) as typeof import('../lib/model').modelJson,
  };
  try {
    const result = await researchCompany({ job }, (event) => events.push(event), deps);
    expect(searched).toBe(2); expect(calls).toBe(2); expect(result.sources).toHaveLength(2);
    expect(result.sources[0].kind).toBe('web'); expect(result.sources[1].kind).toBe('snippet');
    expect(result.data.facts).toHaveLength(1); expect(result.data.roleInsights![0].requirementIds).toEqual(['r1']);
    expect(events.map((event) => event.type)).toEqual(['progress', 'progress', 'progress', 'sources', 'progress', 'result']);
    expect(result.data.research!.queries.every((query) => query.startsWith(job.company))).toBe(true);
    expect(() => groundResearch({ identityMatched: false, identityNote: '无法区分同名公司', facts: [], businesses: [], roleInsights: [], hypotheses: [], questions: [] }, { job }, result.sources)).toThrow('还无法确认');
  } finally { if (key === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = key; }
});

test('Tavily请求只发送搜索词并对上游错误隐藏密钥和响应正文', async () => {
  const originalFetch = globalThis.fetch; const key = process.env.TAVILY_API_KEY; const bocha = process.env.BOCHA_API_KEY;
  delete process.env.BOCHA_API_KEY; process.env.TAVILY_API_KEY = 'test-only-search';
  try {
    globalThis.fetch = async (url, options) => { expect(String(url)).toBe('https://api.tavily.com/search'); expect(JSON.parse(options!.body as string)).toMatchObject({ query: '云帆科技 公司业务', search_depth: 'basic', include_answer: false }); return Response.json({ error: 'sensitive upstream detail' }, { status: 401 }); };
    await expect(webSearch('云帆科技 公司业务', new AbortController().signal)).rejects.toThrow('这次搜索未完成');
  } finally { globalThis.fetch = originalFetch; for (const [name, value] of [['TAVILY_API_KEY', key], ['BOCHA_API_KEY', bocha]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; } }
});

test('岗位体验的真实调用提示包含工作沟通规范，提问不会提前推进任务', async () => {
  const restore = await isolateModel(); const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options!.body as string); const system = body.messages[0].content;
      expect(system).toContain('禁止小说化叙事'); expect(system).toContain('不自动假设同事已同意');
      const input = JSON.parse(body.messages[1].content);
      if (input.stage === 'dialogue') expect(system).toContain('本轮只回复用户向同事提出的问题');
      else { expect(system).toContain('尚未执行任何操作'); expect(system).toContain('不能声称已经查完日志'); }
      return Response.json({ choices: [{ message: { content: JSON.stringify({ dialogue: '还需要数据同事确认统计口径，我可以先提供现有反馈记录。', consequence: '', feedback: null }) } }] });
    };
    const data = await assist({ action: 'scenario', stage: 'dialogue', job: { id: 'j1', title: '产品经理', company: '云帆科技', content: '负责需求分析' }, answer: '已有的统计口径是什么？' });
    expect(data).toMatchObject({ consequence: '', feedback: null });
    await assist({ action: 'scenario', stage: 'decision', job: { id: 'j1', title: '产品经理', company: '云帆科技', content: '负责需求分析' }, answer: '先确认日志的指标与时间范围' });
  } finally { globalThis.fetch = originalFetch; restore(); }
});

import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { api, displayText, displayProjectText } from '../lib/client';
import { POST as recommend } from '../app/api/project-recommendations/route';
import { modelJson, withModelRequest } from '../lib/model';
import type { Project, RecommendationResult } from '../lib/database';
import { researchCompany, groundResearch, type ResearchEvent } from '../lib/company-research';
import { normalizeHits, webSearch } from '../lib/web-search';
import { assist } from '../lib/assistant';
import { modelConfiguration } from '../lib/model-config';
import { groundClassification, classifyJobs } from '../lib/role-classification';
import { categoryFor, roleInputVersion } from '../lib/role-taxonomy';
import { parseJob } from '../lib/job-parser';
import { parseBackup } from '../lib/backup';
import { normalizeHiringType } from '../lib/job-normalization';
import { splitDialogue } from '../lib/dialogue';
import { authenticateAccount, createSession } from '../lib/account-server';
import { accountCookie } from '../lib/account-types';

function setEnvironment(values: Record<string, string | undefined>) {
  const original = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  return () => { for (const [name, value] of Object.entries(original)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } };
}

test.beforeEach(() => {
  // Never let local credentials influence provider selection in mocked regressions.
  process.env.MODEL_PROVIDER = 'chatecnu';
  process.env.SEARCH_PROVIDER = 'tavily';
});

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin' } });
  expect(response.ok()).toBe(true);
});

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

test('生成与事实核对共用截止时间，核对超时用已确认原句补全表述', async () => {
  const restoreEnv = await isolateModel();
  const token = await createSession(await authenticateAccount('admin', 'admin'));
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const timers: { milliseconds: number; controller: AbortController }[] = [];
  let upstreamCalls = 0;
  let auditSignal: AbortSignal | undefined;
  const data = { recommendations: [{ projectId: 'p1', rank: 1, role: 'primary', matchType: 'direct', requirementIds: ['r1'], factIds: ['f1'], reason: '事务相关', resumeBullets: [{ text: '实现事务处理', factIds: ['f1'] }], interviewOutline: [] }], gaps: [], needsReview: [] };
  try {
    AbortSignal.timeout = (milliseconds) => { const controller = new AbortController(); timers.push({ milliseconds, controller }); return controller.signal; };
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('/api/')) return recommend(new Request('http://localhost/api/project-recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': crypto.randomUUID(), cookie: `${accountCookie}=${token}` }, body: options?.body, signal: options?.signal }));
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
    expect(result.recommendations[0].resumeBullets).toEqual([{ text: '实现事务处理', factIds: ['f1'] }]);
    expect(result.recommendations[0].interviewOutline).toEqual([{ text: '实现事务处理', factIds: ['f1'] }]);
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

test('硬件研究把参数放在有原文依据的举例中，自动与补充资料分析共用概括建议规则', async () => {
  const restore = await isolateModel(); const originalFetch = globalThis.fetch;
  const restoreSearch = setEnvironment({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'test-only-search' });
  const now = new Date().toISOString();
  const job = { id: 'hardware-job', company: '示例硬件公司', title: '硬件工程师', content: '负责可靠性测试与验证。', requirements: [{ id: 'r1', text: '可靠性测试与验证', sourceText: '负责可靠性测试与验证。' }] };
  const text = '该产品公开测试范围为零下20度至60度，用于说明工作环境适应性。';
  const source = { id: 'hardware-source', jobId: job.id, label: '公开产品测试说明', url: 'https://example.com/hardware', text, collectedAt: now };
  const advice = { text: '梳理可靠性目标与验证思路', reason: '结合JD，准备说明验证条件的选择及不同目标之间的取舍。', example: '公开产品的零下20度至60度测试范围可帮助理解环境适应性，不代表当前岗位的考核要求。', requirementIds: ['r1'], factIds: [], sourceIds: [source.id], sourceQuotes: [{ sourceId: source.id, quote: text }] };
  try {
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options!.body as string); const prompt = request.messages[0].content;
      expect(prompt).toContain('建议先概括'); expect(prompt).toContain('不能推导为当前岗位'); expect(prompt).toContain('JD明确写出的指标应保留');
      return Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [advice], businesses: [advice], roleInsights: [advice], hypotheses: [], questions: [{ ...advice, sourceQuotes: [{ sourceId: source.id, quote: '来源中不存在的测试数据' }] }] }) } }] });
    };
    const manual = await assist({ action: 'company', job, sources: [source] });
    if (!('facts' in manual)) throw Error('Expected company analysis');
    expect(manual.roleInsights?.[0].example).toBe(advice.example); expect(manual.questions[0].example).toBeUndefined();
    let calls = 0;
    const automatic = await researchCompany({ job }, () => {}, {
      search: async () => [{ title: source.label, url: source.url, snippet: text }],
      validate: async url => ({ url: new URL(url), addresses: [{ address: '93.184.216.34', family: 4 }] }),
      read: async url => ({ status: 200, headers: { 'content-type': 'text/html' }, url, body: Buffer.from(`<html><body>${text.repeat(12)}</body></html>`) }),
      json: async (prompt, content) => {
        if (++calls === 1) return { keywords: ['官网 产品'] };
        expect(prompt).toContain('建议先概括'); expect(prompt).toContain('不能推导为当前岗位');
        const { sources } = JSON.parse(content as string); const row = { ...advice, sourceIds: [sources[0].id], quotes: [{ sourceId: sources[0].id, quote: text }] };
        return { identityMatched: true, identityNote: '主体匹配', facts: [row], businesses: [row], roleInsights: [row], hypotheses: [], questions: [] };
      },
    });
    expect(automatic.data.roleInsights![0].example).toBe(advice.example);
    const parsed = parseBackup({ format: 'jdtool-backup', version: 2, jobs: [{ ...job, status: '关注中', nextAction: '', createdAt: now, updatedAt: now }], sources: automatic.sources, companies: [{ id: 'hardware-result', jobId: job.id, createdAt: now, inputVersion: 'hardware', data: automatic.data }] });
    expect(parsed.companies[0].data.roleInsights![0].example).toBe(advice.example);
  } finally { globalThis.fetch = originalFetch; restore(); restoreSearch(); }
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
      expect(system).toContain('只填写角色实际说出口的消息正文');
      return Response.json({ choices: [{ message: { content: JSON.stringify({ dialogue: '产品经理回复道：“还需要数据同事确认统计口径，我可以先提供现有反馈记录。”', consequence: '', feedback: null }) } }] });
    };
    const data = await assist({ action: 'scenario', stage: 'dialogue', job: { id: 'j1', title: '产品经理', company: '云帆科技', content: '负责需求分析' }, answer: '已有的统计口径是什么？' });
    expect(data).toMatchObject({ dialogue: '还需要数据同事确认统计口径，我可以先提供现有反馈记录。', consequence: '', feedback: null });
    await assist({ action: 'scenario', stage: 'decision', job: { id: 'j1', title: '产品经理', company: '云帆科技', content: '负责需求分析' }, answer: '先确认日志的指标与时间范围' });
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('普通生成优先ChatECNU，显式指定服务时不会静默回退', () => {
  expect(modelConfiguration({ DASHSCOPE_API_KEY: ' test-bailian ', CHAT_ECNU_API_KEY: 'test-ecnu' })).toMatchObject({ provider: 'chatecnu', key: 'test-ecnu', model: 'ecnu-plus' });
  expect(modelConfiguration({ DASHSCOPE_API_KEY: ' ', CHAT_ECNU_API_KEY: 'test-ecnu' }).provider).toBe('chatecnu');
  expect(modelConfiguration({ MODEL_PROVIDER: 'chatecnu', DASHSCOPE_API_KEY: 'test-bailian', CHAT_ECNU_API_KEY: 'test-ecnu' }).provider).toBe('chatecnu');
  expect(() => modelConfiguration({ MODEL_PROVIDER: 'bailian', CHAT_ECNU_API_KEY: 'test-ecnu' })).toThrow();
  expect(() => modelConfiguration({ MODEL_PROVIDER: 'typo', CHAT_ECNU_API_KEY: 'test-ecnu' })).toThrow();
});

test('百炼保留图片输入与结构要求，使用兼容的JSON模式且失败不会换模型', async () => {
  const restoreModel = await isolateModel(); const originalFetch = globalThis.fetch;
  const restore = setEnvironment({ MODEL_PROVIDER: 'bailian', DASHSCOPE_API_KEY: 'test-only-bailian', DASHSCOPE_BASE_URL: 'https://bailian.test.invalid/compatible-mode/v1', DASHSCOPE_MODEL: 'qwen3.8-27b' });
  let calls = 0;
  try {
    const content = [{ type: 'text' as const, text: '识别岗位截图' }, { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,dGVzdA==' } }];
    globalThis.fetch = async (url, options) => {
      calls++; expect(String(url)).toBe('https://bailian.test.invalid/compatible-mode/v1/chat/completions');
      expect(options!.headers).toMatchObject({ Authorization: 'Bearer test-only-bailian' });
      const body = JSON.parse(options!.body as string);
      expect(body).toMatchObject({ model: 'qwen3.8-27b', enable_thinking: false, response_format: { type: 'json_object' } });
      expect(body.thinking).toBeUndefined(); expect(body.enable_search).toBeUndefined();
      expect(body.messages[1].content).toEqual(content);
      if (calls === 1) expect(body.messages[0].content).toContain('"required":["title"]');
      return calls === 1 ? Response.json({ choices: [{ message: { content: '{"title":"产品经理"}' } }] }) : Response.json({ error: 'test-only-bailian secret upstream' }, { status: 401 });
    };
    expect(await modelJson('识别', content, { type: 'object', required: ['title'] })).toEqual({ title: '产品经理' });
    await expect(modelJson('识别', content)).rejects.toThrow('暂时无法完成解析');
    expect(calls).toBe(2);
  } finally { globalThis.fetch = originalFetch; restore(); restoreModel(); }
});

test('百炼搜索跨分片读取真实来源，忽略回答内的虚构链接，并计入每日额度', async () => {
  const restoreModel = await isolateModel(); const originalFetch = globalThis.fetch;
  const restore = setEnvironment({ SEARCH_PROVIDER: 'bailian', DASHSCOPE_API_KEY: 'test-only-bailian', DASHSCOPE_BASE_URL: 'https://bailian.test.invalid/compatible-mode/v1', DASHSCOPE_MODEL: 'qwen3.8-27b', DAILY_MODEL_REQUEST_LIMIT: '1' });
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++; expect(String(url)).toBe('https://bailian.test.invalid/api/v1/services/aigc/multimodal-generation/generation');
      expect(options!.headers).toMatchObject({ 'X-DashScope-SSE': 'enable' });
      const body = JSON.parse(options!.body as string);
      expect(body.parameters).toMatchObject({ enable_search: true, enable_thinking: false, search_options: { search_strategy: 'turbo', forced_search: true, enable_source: true } });
      expect(JSON.stringify(body.input)).toContain('云帆科技'); expect(JSON.stringify(body.input)).not.toContain('项目经历');
      const event = { output: { search_info: { search_results: [{ title: '云帆科技官网', url: 'https://example.com/about?utm_source=bailian' }, { title: '重复', url: 'https://example.com/about' }, { title: '危险', url: 'javascript:alert(1)' }] }, choices: [{ message: { content: '虚构 https://made-up.invalid/' } }] } };
      const bytes = new TextEncoder().encode(`event:result\r\ndata:${JSON.stringify(event)}\r\n\r\ndata:[DONE]\n\n`);
      return new Response(new ReadableStream({ start(controller) { for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7)); controller.close(); } }));
    };
    expect(await webSearch('云帆科技 公司业务', new AbortController().signal)).toEqual([{ title: '云帆科技官网', url: 'https://example.com/about', snippet: '', requiresReading: true }]);
    await expect(webSearch('云帆科技 公司业务', new AbortController().signal)).rejects.toThrow('今天的使用次数'); expect(calls).toBe(1);
  } finally { globalThis.fetch = originalFetch; restore(); restoreModel(); }
});

test('百炼只有来源标题且网页读取失败时，不会生成公司业务事实', async () => {
  const restore = setEnvironment({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'test-only-search' }); let calls = 0;
  try {
    await expect(researchCompany({ job: { id: 'native-j1', company: '云帆科技', title: '产品经理' } }, () => {}, {
      search: async () => [{ title: '云帆科技协作产品', url: 'https://example.com/', snippet: '', requiresReading: true }],
      validate: async () => ({ url: new URL('https://example.com/'), addresses: [{ address: '93.184.216.34', family: 4 }] }),
      read: async () => { throw new Error('page unavailable'); },
      json: async () => { calls++; return { keywords: ['官网'] }; },
    })).rejects.toThrow('没有找到可读取的公开资料');
    expect(calls).toBe(1);
  } finally { restore(); }
});

test('百炼流内错误不泄露响应正文，取消后不发送请求', async () => {
  const restoreModel = await isolateModel(); const originalFetch = globalThis.fetch;
  const restore = setEnvironment({ SEARCH_PROVIDER: 'bailian', DASHSCOPE_API_KEY: 'test-only-bailian', DASHSCOPE_BASE_URL: 'https://bailian.test.invalid/compatible-mode/v1' }); let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return new Response('data:{"code":"InvalidApiKey","message":"test-only-bailian sensitive"}\n\n'); };
    await expect(webSearch('云帆科技', new AbortController().signal)).rejects.toThrow('搜索服务配置暂不可用');
    const controller = new AbortController(); controller.abort();
    await expect(webSearch('云帆科技', controller.signal)).rejects.toThrow(); expect(calls).toBe(1);
  } finally { globalThis.fetch = originalFetch; restore(); restoreModel(); }
});

test('公司介绍结果较多时，岗位搜索来源仍会读取并用于分析', async () => {
  const restore = setEnvironment({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'test-only-search' }); let calls = 0;
  const text = '云帆科技提供企业会议记录与团队协作产品。'; const readUrls: string[] = [];
  try {
    const result = await researchCompany({ job: { id: 'balanced-j1', company: '云帆科技', title: '产品经理', requirements: [{ id: 'r1', text: '调研会议协作需求' }] } }, () => {}, {
      search: async (query) => query.includes('岗位方向') ? [{ title: '会议协作产品', url: 'https://example.org/role', snippet: '', requiresReading: true }] : Array.from({ length: 10 }, (_, index) => ({ title: `公司介绍${index}`, url: `https://example.com/about-${index}`, snippet: '', requiresReading: true })),
      validate: async (url) => ({ url: new URL(url), addresses: [{ address: '93.184.216.34', family: 4 }] }),
      read: async (url) => { readUrls.push(url); return { status: 200, headers: { 'content-type': 'text/html' }, url, body: Buffer.from(`<html><body>${text.repeat(20)}</body></html>`) }; },
      json: async (_system, content) => {
        if (++calls === 1) return { keywords: ['主营业务', '岗位方向'] };
        const { sources } = JSON.parse(content as string);
        const source = sources.find((row: { url: string }) => row.url === 'https://example.org/role'); expect(source).toBeTruthy();
        const row = { text: '调研企业会议协作需求', reason: '关联产品用户场景', requirementIds: ['r1'], sourceIds: [source.id], quotes: [{ sourceId: source.id, quote: text }] };
        return { identityMatched: true, identityNote: '匹配', facts: [row], businesses: [], roleInsights: [row], hypotheses: [], questions: [] };
      },
    });
    expect(readUrls).toHaveLength(4); expect(readUrls[1]).toBe('https://example.org/role'); expect(result.data.roleInsights).toHaveLength(1);
  } finally { restore(); }
});

test('前排网页无法读取时继续尝试后续原生搜索来源，最多读取十个候选', async () => {
  const restore = setEnvironment({ SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: 'test-only-search' }); let calls = 0; let reads = 0;
  const text = '云帆科技提供企业会议记录与团队协作产品。';
  try {
    const result = await researchCompany({ job: { id: 'fallback-j1', company: '云帆科技', title: '产品经理' } }, () => {}, {
      search: async () => Array.from({ length: 10 }, (_, index) => ({ title: `公司资料${index}`, url: `https://example.com/page-${index}`, snippet: '', requiresReading: true })),
      validate: async (url) => ({ url: new URL(url), addresses: [{ address: '93.184.216.34', family: 4 }] }),
      read: async (url) => { reads++; if (!url.endsWith('page-9')) throw new Error('login required'); return { status: 200, headers: { 'content-type': 'text/html' }, url, body: Buffer.from(`<html><body>${text.repeat(20)}</body></html>`) }; },
      json: async (_system, content) => {
        if (++calls === 1) return { keywords: ['官网'] };
        const { sources } = JSON.parse(content as string); expect(sources).toHaveLength(1);
        return { identityMatched: true, identityNote: '匹配', facts: [{ text: '会议记录与团队协作产品', reason: '公司业务', requirementIds: [], sourceIds: [sources[0].id], quotes: [{ sourceId: sources[0].id, quote: text }] }], businesses: [], roleInsights: [], hypotheses: [], questions: [] };
      },
    });
    expect(reads).toBe(10); expect(result.sources[0].url).toBe('https://example.com/page-9'); expect(result.data.facts).toHaveLength(1);
  } finally { restore(); }
});

test('分类必须引用JD正文，无依据结果与修改过JD的旧分类等待补充信息', () => {
  const job = { title: '交互设计师', content: '负责用户访谈和实验设计，采集行为数据并使用统计方法验证研究假设。' };
  const valid = groundClassification({ categoryId: 'user_research', confidence: 'high', reason: '实际工作是研究实验', evidence: ['负责用户访谈和实验设计'] }, job)!;
  expect(categoryFor({ ...job, classification: valid }).id).toBe('user_research');
  expect(categoryFor({ ...job, classification: { ...valid, confidence: 'low' } }).id).toBe('user_research');
  expect(categoryFor({ ...job, categoryOverride: 'product_management' }).name).toBe('产品经理');
  expect(categoryFor({ ...job, content: '负责服务端接口与数据库开发。', classification: valid }).id).toBe('undetermined');
  const fabricated = groundClassification({ categoryId: 'experience_design', confidence: 'high', reason: '岗位名称包含交互', evidence: ['设计交互原型并验证用户流程'] }, job)!;
  expect(fabricated.categoryId).toBe('undetermined'); expect(fabricated.evidence).toEqual([]);
  expect(categoryFor({ ...job, classification: fabricated, categoryOverride: 'experience_design' }).id).toBe('experience_design');
});

test('解析JD同时保留原岗位名称，并将有正文依据的职位分类带回校对页面', async () => {
  const restore = await isolateModel(); const originalFetch = globalThis.fetch;
  const content = '公司：测试公司。岗位：体验设计师。负责用户流程和交互原型设计，开展可用性测试。';
  try {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ isJobPosting: true, rawText: '', title: '体验设计师', company: '测试公司', location: '', direction: '交互体验', hiringType: '校园招聘', responsibilities: [{ text: '用户流程和原型设计', sourceText: '负责用户流程和交互原型设计' }], requirements: [], warnings: [], classification: { categoryId: 'experience_design', confidence: 'high', reason: '工作内容为流程与原型设计', evidence: ['负责用户流程和交互原型设计'] } }) } }] });
    const result = await parseJob(content);
    expect(result.hiringType).toBe('校招'); expect(result.rawText).toBe(content);
    expect(result.title).toBe('体验设计师'); expect(result.classification?.categoryId).toBe('experience_design');
    expect(result.classification?.inputVersion).toBe(roleInputVersion({ ...result, content }));
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('批量归类拒绝未请求的编号和重复编号，不把另一份JD的分类套到当前岗位', async () => {
  const restore = await isolateModel(); const originalFetch = globalThis.fetch;
  const job = { id: 'role-j1', title: '体验设计师', content: '负责用户任务流程和交互原型设计，并开展可用性测试。' };
  const classification = { categoryId: 'experience_design', confidence: 'high', reason: '流程和原型设计', evidence: ['负责用户任务流程和交互原型设计'] };
  try {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ classifications: [{ jobId: 'not-requested', classification }, { jobId: job.id, classification }, { jobId: job.id, classification }] }) } }] });
    await expect(classifyJobs({ jobs: [job] })).rejects.toThrow('有依据的归类结果');
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('备份保留分类依据和手动合并记录，拒绝损坏的职位分类', () => {
  const job = { id: 'backup-role', title: '体验设计师', company: '测试公司', content: '负责用户流程与原型设计。', status: '关注中', nextAction: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), categoryOverride: 'experience_design', classification: { categoryId: 'experience_design', confidence: 'high', reason: '流程设计', evidence: ['负责用户流程与原型设计'], inputVersion: 'current', classifiedAt: new Date().toISOString() } };
  const backup = { format: 'jdtool-backup', version: 2, jobs: [job] };
  expect(parseBackup(backup).jobs[0].classification?.evidence).toEqual(job.classification.evidence);
  expect(parseBackup(backup).jobs[0].categoryOverride).toBe('experience_design');
  expect(() => parseBackup({ ...backup, jobs: [{ ...job, classification: { ...job.classification, categoryId: 'fake-category' } }] })).toThrow('资料格式');
});

test('单次归类超过六个岗位时先拒绝请求，不消耗生成额度', async ({ request }) => {
  const response = await request.post('/api/jobs/classify', { data: { jobs: Array.from({ length: 7 }, (_, index) => ({ id: `too-many-${index}`, title: '设计师', content: '负责用户流程与交互原型设计，并进行测试验证。' })) } });
  expect(response.status()).toBe(400); expect((await response.json()).error.code).toBe('INVALID_CLASSIFICATION_INPUT');
});

test('招聘类型只合并校招的同义名称，保留其他类型和JD原文', () => {
  expect(normalizeHiringType(' 校园 招聘 ')).toBe('校招'); expect(normalizeHiringType('校招')).toBe('校招');
  for (const type of ['实习', '社会招聘', '校园招聘实习生', '校招 / 实习', '']) expect(normalizeHiringType(type)).toBe(type);
  const now = new Date().toISOString();
  const job = { id: 'normalize-job', title: '产品经理', company: '测试公司', content: '校园招聘：负责需求分析和产品规划。', hiringType: '校园招聘', status: '关注中', nextAction: '', createdAt: now, updatedAt: now };
  const restored = parseBackup({ format: 'jdtool-backup', version: 1, jobs: [job] }).jobs[0];
  expect(restored.hiringType).toBe('校招'); expect(restored.content).toBe(job.content);
});

test('工作消息分开说话人和正文，保留正文里的引述与冒号', () => {
  expect(splitDialogue('产品经理发来消息：“请给座椅噪音和氛围灯反馈排序，下午评审要用。”', '产品经理')).toEqual({ speaker: '产品经理', action: '发来消息', content: '请给座椅噪音和氛围灯反馈排序，下午评审要用。' });
  expect(splitDialogue('技术负责人回复道：“先核对日志，再确认范围。”', '技术负责人').content).toBe('先核对日志，再确认范围。');
  expect(splitDialogue('产品经理：请整理反馈。', '产品经理').content).toBe('请整理反馈。');
  expect(splitDialogue('“请核对反馈里提到的“滑轨噪音”，再排优先级。”', '产品经理').content).toBe('请核对反馈里提到的“滑轨噪音”，再排优先级。');
  for (const content of ['反馈里写着：“座椅有噪音”，请先核对。', '请整理两类反馈：座椅噪音和灯光颜色。', '“第一条反馈”“第二条反馈”']) expect(splitDialogue(content, '产品经理').content).toBe(content);
});

test('生成工作任务时清理说话介绍，保留独立的角色和交付要求', async () => {
  const restore = await isolateModel(); const originalFetch = globalThis.fetch;
  const node = { title: '排序反馈', colleague: '产品经理', situation: '产品经理发来消息：“请先整理反馈覆盖人数，再评估优先级。”', choices: ['核对覆盖人数', '整理复现条件'], change: '交付要求：给出优先级和理由。' };
  try {
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ id: 'message-exercise', direction: '产品经理', background: '练习任务：整理反馈优先级。', question: '如何安排需求优先级？', dimensions: ['分析', '沟通', '协作'], followupDirections: [], nodes: [node, { ...node, title: '确定验证方案' }] }) } }] });
    const data = await assist({ action: 'exercise', job: { id: 'message-job', title: '产品经理', company: '测试公司', content: '负责需求分析和产品优先级规划。' } });
    expect(data).toMatchObject({ nodes: [{ colleague: '产品经理', situation: '请先整理反馈覆盖人数，再评估优先级。', change: node.change }, { situation: '请先整理反馈覆盖人数，再评估优先级。' }] });
  } finally { globalThis.fetch = originalFetch; restore(); }
});

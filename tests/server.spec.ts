import { expect, test } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { api, displayText, displayProjectText } from '../lib/client';
import { POST as recommend } from '../app/api/project-recommendations/route';
import { modelJson, withModelRequest } from '../lib/model';
import type { Project, RecommendationResult } from '../lib/database';

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

import { test, expect } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { assist } from '../lib/assistant';
import { practiceSources } from '../lib/practice-context';
import { parseBackup } from '../lib/backup';

test('练习资料按JD选择摘录，保留来源编号，控制输入长度', () => {
  const sources = [{ id: 'a', label: '公司介绍', text: '历史资料。'.repeat(3000) + '用户访谈和需求验证。'.repeat(100) }, { id: 'b', label: '产品介绍', text: '用户需求验证。'.repeat(3000) }];
  const selected = practiceSources({ title: '用户需求分析', requirements: [{ text: '用户访谈和需求验证' }] }, sources, 5000);
  expect(selected.map(source => source.id)).toEqual(['a', 'b']); expect(selected.map(source => source.text).join('').length).toBeLessThanOrEqual(5000); expect(selected[0].text).toContain('用户访谈'); expect(sources[0].text.length).toBeGreaterThan(10000);
});

test('面试和岗位体验分别生成所需内容，限制输出，省去其他模式内容', async () => {
  const names = ['MODEL_PROVIDER', 'CHAT_ECNU_API_KEY', 'CHAT_ECNU_BASE_URL', 'APP_DATA_DIR']; const old = Object.fromEntries(names.map(name => [name, process.env[name]]));
  await mkdir('.local', { recursive: true }); Object.assign(process.env, { MODEL_PROVIDER: 'chatecnu', CHAT_ECNU_API_KEY: 'test-only-placeholder', CHAT_ECNU_BASE_URL: 'https://test.invalid', APP_DATA_DIR: await mkdtemp('.local/practice-model-') });
  const original = globalThis.fetch; const calls: Record<string, any>[] = [];
  const seed = { id: 'e1', direction: '产品经理', background: '讨论产品需求', dimensions: ['需求', '协作', '验证'] };
  const node = { title: '整理问题', situation: '产品经理发来消息：“请整理问题。”', colleague: '产品经理', choices: ['先核对反馈', '先看使用数据'], change: '交付要求：列出下一步' };
  try {
    globalThis.fetch = async (_url, options) => { const body = JSON.parse(String(options?.body)); calls.push(body); const input = JSON.parse(body.messages[1].content); const data = input.mode === 'interview' ? { ...seed, question: '如何判断优先级？', followupDirections: ['证据'] } : { ...seed, nodes: [node, node] }; return Response.json({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason: 'stop' }] }); };
    const job = { id: 'j1', title: '产品经理', company: '测试公司', content: '分析用户需求' }; const sources = [{ id: 's1', label: '来源', text: '用户需求。'.repeat(4000) }];
    const interview = await assist({ action: 'exercise', mode: 'interview', job, sources }) as any; expect(interview.nodes).toEqual([]); expect(interview.question).toBeTruthy();
    const scenario = await assist({ action: 'exercise', mode: 'scenario', job, sources }) as any; expect(scenario.nodes).toHaveLength(2); expect(scenario.question).toBe(''); expect(scenario.followupDirections).toEqual([]); expect(scenario.nodes[0].situation).toBe('请整理问题。');
    expect(calls.map(call => call.max_tokens)).toEqual([2200, 3800]); expect(calls.every(call => call.thinking.type === 'disabled')).toBe(true); expect(JSON.parse(calls[0].messages[1].content).sources[0].text.length).toBeLessThanOrEqual(2400);
  } finally { globalThis.fetch = original; for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; } }
});

test('备份支持只包含面试题的练习，拒绝任务缺失的岗位体验', () => {
  const data = { format: 'jdtool-backup', version: 2, jobs: [], practice: [{ id: 'p1', jobId: 'j1', type: 'interview', inputVersion: '', updatedAt: new Date().toISOString(), data: { exercise: { id: 'e1', direction: '', background: '', question: '', dimensions: [], followupDirections: [], nodes: [] }, answer: '', followup: '', supplement: '', feedback: null, node: 0, moves: [], choice: '', question: '', response: null } }] };
  expect(parseBackup(data).practice).toHaveLength(1); data.practice[0].type = 'scenario'; expect(() => parseBackup(data)).toThrow('岗位体验任务不完整');
});

test('聊天待回复消息、消息用途与复盘浏览位置随备份保留', () => {
  const data = { format: 'jdtool-backup', version: 2, jobs: [], practice: [{ id: 'p1', jobId: 'j1', type: 'scenario', inputVersion: '', updatedAt: new Date().toISOString(), data: { answer: '', followup: '', supplement: '', feedback: null, node: 1, moves: [{ node: 0, kind: 'plan', colleague: 'Mentor', action: '先核对用户反馈', dialogue: '可以先核对', consequence: '便于判断范围' }], choice: '接着做验证', question: '', response: null, pendingMessage: { node: 1, kind: 'plan', text: '接着做验证' }, reviewOpen: false } }] };
  const restored = parseBackup(data).practice[0].data;
  expect(restored.pendingMessage).toEqual(data.practice[0].data.pendingMessage); expect(restored.moves[0].kind).toBe('plan'); expect(restored.moves[0].colleague).toBe('Mentor'); expect(restored.reviewOpen).toBe(false);
});

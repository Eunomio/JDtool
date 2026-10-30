import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { groundResearch, researchCompany } from '../lib/company-research';
import { completeCompanyQuestions } from '../lib/company-questions';
import { assist } from '../lib/assistant';
import type { Advice } from '../lib/database';

const job = { id: 'question-job', company: '云帆科技', title: '产品经理', responsibilities: [{ id: 'd1', text: '负责企业协作产品需求分析' }], requirements: [{ id: 'r1', text: '了解用户访谈与需求排序' }] };
const quote = '云帆科技为企业团队提供项目协作和需求管理产品。';
const source = { id: 's1', jobId: job.id, label: '官网', url: 'https://example.com/products', text: quote, collectedAt: '2026-10-30T00:00:00Z', kind: 'web' as const };
const fact = { text: '为企业团队提供项目协作产品', reason: '了解服务对象与使用场景', requirementIds: [], sourceIds: [source.id], quotes: [{ sourceId: source.id, quote }] };
const analysis = { identityMatched: true, identityNote: '公司主体相符', facts: [fact], businesses: [], roleInsights: [], hypotheses: [], questions: [] };
const question: Advice = { text: 'JD提到了用户访谈，团队通常由谁参与，结果怎样用于需求排序？', reason: '确认该岗位的协作方式与决策过程。', requirementIds: ['r1'], factIds: [], sourceIds: [] };

test('仅依据JD的面试问题不要求网页原句，仍保留可查看的JD依据', async () => {
  const result = await researchCompany({ job, sources: [source] }, () => {}, {
    search: async () => { throw Error('不应搜索'); }, read: async () => { throw Error('不应读取'); }, validate: async () => { throw Error('不应访问'); },
    json: async () => ({ ...analysis, questions: [question] }),
  });
  const kept = result.data.questions.find(row => row.text === question.text);
  expect(kept).toMatchObject({ requirementIds: ['r1'], sourceIds: [] });
  expect(result.data.questions).toHaveLength(2); expect(result.data.facts).toHaveLength(1);
});

test('公司业务问题保留真实原文，伪造引用的提问和数字均不能保留', () => {
  const text = '这个岗位参与企业协作产品的哪些工作？';
  const result = groundResearch({ ...analysis, questions: [
    { ...fact, text },
    { ...fact, text: '付费转化率提高50%后，为什么还要调整产品？', requirementIds: ['r1'], example: '转化率提高50%', quotes: [{ sourceId: source.id, quote: '付费转化率已经提高了50%' }] },
    { ...fact, text: '营收增长88%以后怎样扩大团队？', requirementIds: ['unknown'], quotes: [] },
  ] }, { job }, [source]);
  expect(result.questions.find(row => row.text === text)?.sourceQuotes).toEqual([{ sourceId: source.id, quote }]);
  expect(JSON.stringify(result.questions)).not.toMatch(/50%|88%/); expect(result.questions).toHaveLength(2);
});

test('漏写或清空问题时补齐两个问题，不重新搜索或增加模型请求', async () => {
  for (const missing of [true, false]) {
    let calls = 0;
    const result = await researchCompany({ job, sources: [source] }, () => {}, {
      search: async () => { throw Error('不应重新搜索'); }, read: async () => { throw Error('不应重新读取'); }, validate: async () => { throw Error('不应访问'); },
      json: async () => { calls++; if (!missing) return analysis; const { questions: _questions, ...without } = analysis; return without; },
    });
    expect(calls).toBe(1); expect(result.data.questions).toHaveLength(2);
    expect(result.data.questions[0].requirementIds).toContain('d1');
    expect(result.data.questions.some(row => row.sourceIds.includes(source.id))).toBe(true);
  }
});

test('没有拆解JD时仍能围绕真实业务和岗位名称提问，不创造JD编号', () => {
  const result = groundResearch(analysis, { job: { id: job.id, company: job.company, title: '硬件工程师' } }, [source]);
  expect(result.questions).toHaveLength(2);
  expect(result.questions.flatMap(row => row.requirementIds)).toEqual([]);
  expect(result.questions.some(row => row.text.includes('硬件工程师'))).toBe(true);
});

test('问题去重、保留两到三个有效问题，剔除不存在的JD编号', () => {
  const rows = completeCompanyQuestions(job, [question, { ...question, text: question.text.replace('，', '， ') }, { ...question, text: '用户访谈的结果通过什么方式交接？', requirementIds: ['r1', 'unknown'] }, { ...question, text: '目前需求排序最常见的分歧是什么？' }, { ...question, text: '不应显示的第四个问题' }], [source]);
  expect(rows).toHaveLength(3); expect(rows.filter(row => row.text === question.text)).toHaveLength(1);
  expect(rows.flatMap(row => row.requirementIds)).not.toContain('unknown');
  expect(rows.map(row => row.text)).not.toContain('不应显示的第四个问题');
});

test('问题规则不会放宽公司业务事实的原文核对', () => {
  expect(() => groundResearch({ ...analysis, facts: [{ ...fact, quotes: [{ sourceId: source.id, quote: '原文中不存在的业务事实说明' }] }], questions: [{ ...question, quotes: [] }] }, { job }, [source])).toThrow('资料不足以说明公司业务');
});

test('分析已保存资料同样补齐面试问题，继续使用原有ECNU服务', async () => {
  const keys = ['MODEL_PROVIDER', 'CHAT_ECNU_API_KEY', 'CHAT_ECNU_BASE_URL', 'APP_DATA_DIR'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])); const original = globalThis.fetch;
  await mkdir('.local', { recursive: true }); Object.assign(process.env, { MODEL_PROVIDER: 'chatecnu', CHAT_ECNU_API_KEY: 'test-questions', CHAT_ECNU_BASE_URL: 'https://questions.test.invalid', APP_DATA_DIR: await mkdtemp('.local/company-questions-') });
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++; expect(String(url)).toBe('https://questions.test.invalid/chat/completions');
      expect(JSON.parse(String(options?.body)).messages[0].content).toContain('questions必须给出2—3个');
      return Response.json({ choices: [{ message: { content: JSON.stringify({ facts: [{ ...fact, factIds: [], sourceQuotes: fact.quotes }], hypotheses: [] }) } }] });
    };
    const result = await assist({ action: 'company', job: { ...job, content: '负责企业协作产品需求分析。' }, sources: [source] });
    if (!('questions' in result)) throw Error('Expected company analysis');
    expect(result.questions).toHaveLength(2); expect(calls).toBe(1);
  } finally { globalThis.fetch = original; for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

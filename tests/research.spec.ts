import { test, expect, type Page } from './fixtures';

const now = '2026-10-20T09:00:00.000Z';
const job = { id: 'research-job', title: '产品经理', company: '云帆科技', content: '负责企业协作产品需求分析。', responsibilities: [{ id: 'r1', text: '企业协作产品需求分析', sourceText: '负责企业协作产品需求分析。' }], requirements: [], status: '关注中', nextAction: '', createdAt: now, updatedAt: now };
const source = { id: 'research-source', jobId: job.id, label: '云帆科技产品介绍', url: 'https://example.com/products', text: '云帆科技提供企业协作产品，服务企业团队的项目协同。', collectedAt: now, kind: 'web' };
const advice = { text: '围绕企业团队的项目协同，准备需求优先级判断的方法。', reason: '对应JD中的需求分析职责。', requirementIds: ['r1'], factIds: [], sourceIds: [source.id] };
const result = { facts: [advice], businesses: [advice], roleInsights: [advice], hypotheses: [], questions: [{ ...advice, text: '这个岗位主要负责哪类客户的协作流程？' }], research: { company: job.company, summary: '云帆科技提供企业协作产品。', identityNote: '来源描述的公司名称与当前岗位一致。', queries: ['云帆科技 企业协作 官网'], searchedAt: now } };

async function seed(page: Page) {
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('选择备份文件').setInputFiles({ name: 'research.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs: [job] })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
}
function stream(events: unknown[]) { return events.map((event) => JSON.stringify(event)).join('\n') + '\n'; }

test('自动公司研究保留来源与岗位关联，刷新复用结果，准备时使用搜索资料', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/company/research', async (route) => {
    requests++;
    const body = route.request().postDataJSON(); expect(body.job.company).toBe(job.company); expect(body.job.content).toBeUndefined(); expect(body.projects).toBeUndefined();
    await route.fulfill({ contentType: 'application/x-ndjson', body: stream([{ type: 'progress', stage: 'searching', message: '正在搜索公司业务', queries: result.research.queries }, { type: 'sources', sources: [source] }, { type: 'result', data: result }]) });
  });
  await page.route('**/api/assist', async (route) => { const body = route.request().postDataJSON(); expect(body.action).toBe('preparation'); expect(body.sources[0].id).toBe(source.id); await route.fulfill({ json: { priorities: [advice], strengths: [], gaps: [], companyResearch: [advice] } }); });
  await seed(page); await page.getByRole('button', { name: job.title, exact: true }).click();
  await expect(page.getByText(result.research.summary, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '这个岗位与业务的关系' })).toBeVisible();
  await page.getByText('查看来源与补充公司资料', { exact: false }).click();
  await expect(page.getByRole('link', { name: `${source.label} ↗`, exact: true })).toHaveAttribute('href', source.url);
  await expect(page.getByText('已读取网页', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /面试准备/ }).click(); await page.getByRole('button', { name: '生成岗位准备卡' }).click();
  await expect(page.getByRole('heading', { name: '岗位看重什么', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: '岗位清单', exact: true }).click(); await page.getByRole('button', { name: job.title, exact: true }).click();
  await expect(page.getByText(result.research.summary, { exact: true })).toBeVisible(); expect(requests).toBe(1);
  await page.getByText('资料备份', { exact: true }).click(); const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份' }).click();
  const download = await downloading; const { readFile } = await import('node:fs/promises'); const data = JSON.parse(await readFile((await download.path())!, 'utf8')); expect(data.sources[0].kind).toBe('web'); expect(data.companies[0].data.research.summary).toBe(result.research.summary);
});

test('研究失败保留已读取资料，重试成功后不重复保存来源', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/company/research', (route) => { requests++; return route.fulfill({ contentType: 'application/x-ndjson', body: stream([{ type: 'sources', sources: [source] }, requests === 1 ? { type: 'error', message: '资料已保存，业务分析尚未完成，请重试。' } : { type: 'result', data: result }]) }); });
  await seed(page); await page.getByRole('button', { name: job.title, exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('资料已保存');
  await page.getByText('查看来源与补充公司资料', { exact: false }).click();
  await expect(page.getByRole('link', { name: `${source.label} ↗`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试搜索', exact: true }).click(); await expect(page.getByText(result.research.summary, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `${source.label} ↗`, exact: true })).toHaveCount(1); expect(requests).toBe(2);
});

test('准备流程键盘切换、项目返回上下文与手机页面宽度', async ({ page }) => {
  await seed(page); await page.getByRole('button', { name: job.title, exact: true }).click();
  const understand = page.getByRole('tab', { name: /了解岗位与公司/ }); await understand.focus(); await understand.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /准备项目/ })).toBeFocused();
  await expect(page.getByRole('heading', { name: '按岗位组装项目' })).toBeVisible();
  await page.getByRole('button', { name: /整理我的项目/ }).click(); await expect(page.getByText(/正在为 云帆科技/)).toBeVisible();
  await page.getByRole('button', { name: /返回岗位继续准备/ }).click();
  await expect(page.getByRole('tab', { name: /准备项目/ })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('tab', { name: /准备项目/ }).press('End'); await expect(page.getByRole('tab', { name: /面试准备/ })).toBeFocused();
});

test('计划按钮显示成功反馈，重新生成后新建议可加入，完成事项更新实际进度', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assist', route => { calls++; return route.fulfill({ json: { priorities: [{ ...advice, text: calls === 1 ? '梳理一次企业协作访谈' : '准备一个需求排序案例' }], strengths: [], gaps: [], companyResearch: [] } }); });
  await seed(page); await page.getByRole('button', { name: job.title, exact: true }).click();
  await page.getByRole('tab', { name: /面试准备/ }).click(); await page.getByRole('button', { name: '生成岗位准备卡' }).click();
  const add = page.getByRole('button', { name: '加入我的计划', exact: true });
  await expect(add).toHaveCSS('border-top-width', '1px'); await add.click();
  await expect(page.getByRole('button', { name: '已加入计划', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '重新生成准备卡' }).click();
  await expect(page.getByText('准备一个需求排序案例', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '加入我的计划', exact: true }).click();
  await expect(page.getByRole('button', { name: '已加入计划', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '岗位清单', exact: true }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(2); await page.getByRole('checkbox').first().check();
  await expect(page.locator('.plan-progress progress')).toHaveAttribute('value', '1');
  await expect(page.getByText('又完成一项准备，下一步更有把握。', { exact: true })).toBeVisible();
});

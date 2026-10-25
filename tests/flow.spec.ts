import { test, expect, navigate, type Page } from './fixtures';

const now = '2026-10-23T08:00:00.000Z';
const jobs = ['甲', '乙'].map((name, index) => ({ id: `flow-job-${index}`, title: `产品经理${name}`, company: `测试公司${name}`, content: '负责产品需求分析与研发协作。', requirements: [{ id: `flow-r${index}`, text: '分析用户需求', sourceText: '分析用户需求' }], responsibilities: [], status: '关注中', nextAction: '', createdAt: now, updatedAt: now }));
const advice = (text: string) => ({ text, reason: '对应需求分析职责', requirementIds: ['flow-r0'], factIds: [], sourceIds: [] });
const feedback = { strengths: ['能说明问题边界'], improvements: ['补充验证周期'], dimensions: [{ name: '需求判断', feedback: '需要说明证据', requirementIds: ['flow-r0'] }], outline: ['先核对问题'], nextActions: ['再整理一份验证计划'] };
const exercise = { id: 'flow-exercise', direction: '产品经理', background: '处理产品需求', question: '如何判断优先级？', dimensions: ['需求', '协作', '验证'], followupDirections: ['证据'], nodes: [] };
async function seed(page: Page, extras: Record<string, unknown> = {}) {
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'flow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs, ...extras })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
}

test('首页集中回看待办、各岗位准备卡和练习复盘，分区切换与筛选可继续实际准备', async ({ page }) => {
  await seed(page, {
    tasks: jobs.map((job, index) => ({ id: `flow-task${index}`, text: `整理岗位${index}的需求案例`, jobIds: [job.id], done: false, order: index, createdAt: now })),
    preparations: jobs.map(job => ({ id: `flow-card-${job.id}`, jobId: job.id, inputVersion: 'old', createdAt: now, data: { priorities: [advice('先整理需求依据')], strengths: [advice('可以讲述调研过程')], gaps: [advice('补充验证方法')], companyResearch: [advice('了解产品对象')] } })),
    practice: [{ id: `interview-${jobs[0].id}`, jobId: jobs[0].id, type: 'interview', inputVersion: 'old', updatedAt: now, data: { exercise, answer: '核对需求', followup: '如何验证？', supplement: '观察完成率', feedback, node: 0, moves: [], choice: '', question: '', response: null } }],
  });
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  const hub = page.locator('.home-hub'); await expect(hub.locator('.hub-task')).toHaveCount(2);
  await hub.getByRole('checkbox').first().click(); await expect(hub.locator('.hub-task')).toHaveCount(1);
  await hub.getByLabel('待办状态', { exact: true }).selectOption('done'); await expect(hub.getByRole('checkbox')).toBeChecked();
  await hub.getByRole('combobox', { name: '关联岗位', exact: true }).click(); await hub.getByRole('option', { name: `${jobs[0].company} · ${jobs[0].title}`, exact: true }).click();
  await hub.getByRole('tab', { name: '岗位准备卡', exact: true }).click(); await expect(hub.locator('.hub-saved-card:visible')).toHaveCount(1);
  await hub.getByRole('button', { name: '查看准备卡', exact: true }).click();
  await expect(page.getByRole('heading', { name: '岗位准备卡', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '我能讲什么', exact: true }).click(); await expect(page.getByText('可以讲述调研过程', { exact: true })).toBeVisible(); await expect(page.getByText('先整理需求依据', { exact: true })).toBeHidden();
  await expect(page.locator('.preparation-content > [role=tabpanel]:visible')).toHaveCount(1);
  await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.getByRole('tab', { name: '练习复盘', exact: true }).click(); await page.getByRole('button', { name: '回看复盘', exact: true }).click();
  await expect(page.locator('.interview-device')).toBeVisible(); await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '下一步练习', exact: true }).click(); await page.getByRole('button', { name: '加入我的计划', exact: true }).click();
  await page.getByRole('button', { name: '返回首页', exact: true }).click(); await expect(page.locator('.hub-task').filter({ hasText: '再整理一份验证计划' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('首页长岗位名完整换行，筛选支持键盘和取消，移除按钮独立操作', async ({ page }) => {
  const longJob = { ...jobs[0], company: '星桥智能出行与企业协作研究有限公司', title: '高级产品经理（智能座舱与跨端用户体验方向，面向校园招聘及有相关项目经验的候选人）' };
  await seed(page, { jobs: [longJob, jobs[1]], tasks: [longJob, jobs[1]].map((job, index) => ({ id: `long-task${index}`, text: `整理岗位${index}的案例`, jobIds: [job.id], done: false, order: index, createdAt: now })) });
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  const hub = page.locator('.home-hub'); const filter = hub.getByRole('combobox', { name: '关联岗位', exact: true });
  await filter.click(); await hub.getByRole('option', { name: `${longJob.company} · ${longJob.title}`, exact: true }).click();
  await expect(hub.locator('.hub-task')).toHaveCount(1); await expect(filter).toContainText(longJob.title);
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 }); await expect(filter).toBeVisible();
    const task = hub.locator('.hub-task'); const remove = task.getByRole('button', { name: '移除', exact: true });
    const linkBox = (await task.locator('.hub-job-link').boundingBox())!; const removeBox = (await remove.boundingBox())!;
    expect(removeBox.width).toBeGreaterThanOrEqual(88); expect(removeBox.height).toBeGreaterThanOrEqual(44);
    expect(width < 768 ? removeBox.y - (linkBox.y + linkBox.height) : removeBox.x - (linkBox.x + linkBox.width)).toBeGreaterThanOrEqual(10);
    await filter.click(); const option = hub.getByRole('option', { name: `${longJob.company} · ${longJob.title}`, exact: true });
    await expect(option).toBeFocused();
    expect(await option.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await option.press('Escape'); await expect(filter).toBeFocused(); await expect(filter).toHaveAttribute('aria-expanded', 'false');
    expect(await hub.locator('.hub-job-trigger, .hub-job-link').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await filter.press('ArrowDown'); await hub.getByRole('option', { name: `${longJob.company} · ${longJob.title}`, exact: true }).press('End');
  await expect(hub.getByRole('listbox').getByRole('option').last()).toBeFocused(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(hub.locator('.hub-task')).toHaveCount(1); await expect(hub.locator('.hub-task')).toContainText('整理岗位1的案例');
  await filter.click(); await hub.getByRole('option', { name: '全部岗位', exact: true }).click(); await expect(hub.locator('.hub-task')).toHaveCount(2);
  await hub.locator('.hub-task').filter({ hasText: '整理岗位0的案例' }).getByRole('button', { name: '移除', exact: true }).click(); await expect(hub.locator('.hub-task')).toHaveCount(1); await expect(hub.locator('.hub-task')).toContainText('整理岗位1的案例');
});

test('项目为空时展开导入，保存项目后收起，刷新和重开仍优先显示已有项目', async ({ page }) => {
  await page.goto('/'); await navigate(page, '我的信息'); const form = page.locator('.project-import-card');
  await expect(form).toHaveAttribute('open', ''); await page.getByRole('button', { name: '使用脱敏示例项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: '专业桌面软件升级项目', exact: true })).toBeVisible(); await expect(form).not.toHaveAttribute('open', '');
  await page.reload(); await navigate(page, '我的信息'); await expect(form).not.toHaveAttribute('open', '');
  await form.locator('summary').first().click(); await expect(page.getByRole('textbox', { name: '简历或项目文字', exact: true })).toBeVisible();
});

test('比较完成后只显示结果，回到顶部，重开保留选择，刷新直接回看结果', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/assist', async route => { calls++; const input = route.request().postDataJSON(); await route.fulfill({ json: { common: [advice('共同的分析方法')], differences: input.jobs.map((job: { id: string }) => ({ jobId: job.id, uniqueRequirements: [advice('这个岗位的具体差异')], projects: [], preparation: [advice('单独准备的知识')] })), reusable: [advice('可以复用的项目材料')] } }); });
  await seed(page, { jobs: [...jobs, ...Array.from({ length: 8 }, (_, index) => ({ ...jobs[0], id: `other-${index}`, title: `其他岗位${index}`, requirements: [] }))] }); await navigate(page, '岗位比较'); await page.getByRole('checkbox', { name: /测试公司甲 · 产品经理甲/ }).check(); await page.getByRole('checkbox', { name: /测试公司乙 · 产品经理乙/ }).check(); await page.getByRole('button', { name: '比较所选岗位', exact: true }).click();
  const result = page.locator('.comparison-results'); await expect(result.getByText('共同的分析方法', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '比较所选岗位', exact: true })).toHaveCount(0); await expect(page.getByRole('checkbox')).toHaveCount(0);
  const heading = page.getByRole('heading', { name: '比较结果', exact: true }); await expect(heading).toBeFocused(); expect((await heading.boundingBox())!.y).toBeLessThan(200); expect(await page.evaluate(() => scrollY)).toBe(0);
  await result.getByRole('tab', { name: '岗位对比', exact: true }).click(); await expect(result.getByText('共同的分析方法', { exact: true })).toBeHidden(); await expect(result.getByText('这个岗位的具体差异', { exact: true })).toHaveCount(2);
  const colors = await result.getByRole('tab', { name: '岗位对比', exact: true }).evaluate(node => [getComputedStyle(node).backgroundColor, getComputedStyle(node.parentElement!).backgroundColor]); expect(colors[0]).not.toBe(colors[1]);
  await result.getByRole('tab', { name: '岗位对比', exact: true }).press('End'); await expect(result.getByText('可以复用的项目材料', { exact: true })).toBeVisible();
  await expect(result.locator(':scope > [role=tabpanel]:visible')).toHaveCount(1); expect(calls).toBe(1);
  await page.reload(); await expect(result).toBeVisible(); await expect(page.locator('.comparison-setup')).toHaveCount(0); expect(calls).toBe(1);
  await page.getByRole('button', { name: '重新比较', exact: true }).click(); await expect(result).toHaveCount(0); await expect(page.locator('.comparison-setup')).toBeVisible(); await expect(page.locator('.comparison-setup input:checked')).toHaveCount(2); expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole('button', { name: '比较所选岗位', exact: true }).click(); await expect(result).toBeVisible(); expect(calls).toBe(2);
});

test('面试只请求当前模式，等待有动画和计时，停止后可重试并复用保存的题目', async ({ page }) => {
  let calls = 0; let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/assist', async route => { calls++; expect(route.request().postDataJSON().mode).toBe('interview'); if (calls === 1) await pending; await route.fulfill({ json: exercise }).catch(() => {}); });
  await seed(page); await navigate(page, '模拟面试');
  const indicator = page.locator('.chat-loading .async-status'); await expect(indicator).toBeVisible(); await expect(page.locator('.practice-skeleton')).toBeVisible(); await expect(indicator.locator('.async-spinner')).toBeVisible();
  await expect(indicator.locator('.async-elapsed')).toContainText(/秒/); await indicator.getByRole('button', { name: '停止', exact: true }).click(); release();
  await expect(page.locator('.practice').getByRole('alert')).toContainText('已停止'); await page.getByRole('button', { name: '重新准备题目', exact: true }).click(); await expect(page.getByRole('textbox', { name: '我的回答', exact: true })).toBeVisible();
  await navigate(page, '岗位清单'); await navigate(page, '模拟面试'); await expect(page.getByRole('textbox', { name: '我的回答', exact: true })).toBeVisible(); expect(calls).toBe(2);
});

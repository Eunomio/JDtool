import { expect, test, navigate } from './fixtures';

const feedback = { strengths: ['先核对问题与证据'], dimensions: [{ name: '需求判断', feedback: '能区分数据口径与用户问题，建议补充验证指标。', requirementIds: ['iflytek-pm-d0'] }], improvements: ['补充验证周期'], outline: ['明确问题', '说明行动与验证计划'], nextActions: ['补充一个可验证的成功指标'] };
const advice = { text: '梳理一个需求分析项目', reason: '对应目标岗位的需求分析职责', requirementIds: ['iflytek-pm-d0'], factIds: ['sample-p1-f1'], sourceIds: [] };

async function seedJobs(page: import('@playwright/test').Page) { await page.goto('/'); await page.getByRole('button', { name: '体验6个示例岗位' }).click(); await expect(page.getByRole('button', { name: '人因研究工程师', exact: true })).toBeVisible(); }

test('简历文字提取、事实确认、编辑与刷新恢复', async ({ page }) => {
  await page.route('**/api/assist', async (route) => {
    expect(route.request().postDataJSON().action).toBe('projects');
    await route.fulfill({ json: { projects: [{ name: '需求分析研究', type: '工作项目', stage: '已测试', timeline: '', role: '需求分析', problem: '', actions: '访谈并整理需求', methods: '访谈', results: '产出需求清单', skills: ['访谈'], facts: [{ text: '访谈并整理需求，产出需求清单', sourceText: '访谈并整理需求，产出需求清单', category: 'action' }], suggestedRedactions: [] }] } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await page.getByLabel('简历或项目文字', { exact: true }).fill('需求分析研究：访谈并整理需求，产出需求清单');
  await page.getByRole('button', { name: '解析为项目事实', exact: true }).click();
  await page.getByRole('button', { name: '核对并新增', exact: true }).click();
  await page.getByRole('checkbox', { name: '我已核对本人角色、项目阶段、事实与结果' }).check();
  await page.getByRole('button', { name: '保存项目事实', exact: true }).click();
  await expect(page.getByRole('heading', { name: '需求分析研究', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await expect(page.getByText('事实已确认', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '编辑与核对' }).click();
  await expect(page.getByLabel('事实条目', { exact: true })).toHaveValue('访谈并整理需求，产出需求清单');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.locator('.project-import-card > summary').click();
  await page.getByLabel('简历或项目文字', { exact: true }).fill('需求分析研究：访谈并整理需求，产出需求清单');
  await page.getByRole('button', { name: '解析为项目事实', exact: true }).click();
  await page.getByRole('button', { name: '核对并合并', exact: true }).click();
  await page.getByRole('checkbox', { name: '我已核对本人角色、项目阶段、事实与结果' }).check();
  await page.getByRole('button', { name: '保存项目事实', exact: true }).click();
  await expect(page.locator('article').filter({ hasText: '需求分析研究' })).toHaveCount(1);
});

test('样本项目、岗位准备卡、事实组装与加入计划', async ({ page }) => {
  await page.route('**/api/assist', (route) => route.fulfill({ json: { priorities: [advice], strengths: [advice], gaps: [], companyResearch: [] } }));
  await seedJobs(page); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await page.getByRole('button', { name: '使用脱敏示例项目' }).click();
  await expect(page.getByRole('heading', { name: '专业桌面软件升级项目', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '岗位清单', exact: true }).click();
  await page.locator('article').filter({ hasText: '科大讯飞' }).getByRole('button', { name: '产品经理', exact: true }).click();
  await page.getByRole('tab', { name: /面试准备/ }).click();
  await page.getByRole('button', { name: '生成岗位准备卡', exact: true }).click();
  await expect(page.getByRole('heading', { name: '岗位准备卡', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '加入我的计划', exact: true }).first().click();
  await page.getByRole('tab', { name: /准备项目/ }).click();
  await page.getByRole('checkbox', { name: '专业桌面软件升级项目', exact: true }).check();
  await page.getByRole('button', { name: '用所选原始事实手动组装' }).click();
  await expect(page.getByRole('textbox', { name: '简历要点1', exact: true })).toHaveValue('在PC端专业软件重构中整理和优化需求');
  await page.getByRole('checkbox', { name: '已核对，采用这条表述' }).first().check();
  await page.getByRole('button', { name: '返回岗位清单', exact: true }).click();
  await expect(page.getByRole('heading', { name: '本周准备', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /梳理一个需求分析项目/ }).check();
  await page.reload(); await expect(page.getByRole('checkbox', { name: /梳理一个需求分析项目/ })).toBeChecked();
});

test('相近与跨方向比较形成各岗位准备任务', async ({ page }) => {
  await page.route('**/api/assist', async (route) => {
    const body = route.request().postDataJSON(); expect(body.action).toBe('compare');
    await route.fulfill({ json: { common: [advice], differences: body.jobs.map((job: { id: string }) => ({ jobId: job.id, uniqueRequirements: [], projects: [], preparation: [advice] })), reusable: [advice] } });
  });
  await seedJobs(page); await navigate(page, '岗位比较');
  await page.getByRole('checkbox', { name: /vivo/ }).check(); await page.getByRole('checkbox', { name: /蔚来 · 人机工程师/ }).check();
  await page.getByRole('button', { name: '比较所选岗位' }).click();
  await expect(page.getByRole('heading', { name: '比较结果', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '跨方向比较' }).click();
  await page.getByRole('checkbox', { name: /蔚来 · 人机工程师/ }).uncheck(); await page.getByRole('checkbox', { name: /科大讯飞/ }).check();
  await page.getByRole('button', { name: '比较所选岗位' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '加入我的计划', exact: true }).first().click();
  await page.getByRole('button', { name: '岗位清单', exact: true }).click(); await expect(page.getByRole('heading', { name: '本周准备' })).toBeVisible();
});

test('面试一次追问、复盘保存与两决策剧情', async ({ page }) => {
  await page.route('**/api/assist', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: input.action === 'interview' ? input.stage === 'followup' ? { followup: '你会如何验证改进的效果？', feedback: null } : { followup: '', feedback } : input.stage === 'review' ? { dialogue: '', consequence: '', feedback } : { dialogue: '我可以提供按用户群划分的使用情况。', consequence: '团队获得了下一轮验证的依据。', feedback: null } });
  });
  await seedJobs(page); await navigate(page, '模拟面试');
  await page.getByLabel('选择目标岗位').selectOption('sample-iflytek-pm');
  await page.getByLabel('我的回答', { exact: true }).fill('核对数据口径并分析用户分群。');
  await page.getByRole('button', { name: '提交回答，获得追问' }).click();
  await expect(page.getByText('你会如何验证改进的效果？', { exact: true })).toBeVisible();
  await page.getByLabel('补充回答', { exact: true }).fill('先小范围验证任务完成率。'); await page.getByRole('button', { name: '提交补充，查看复盘' }).click();
  await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible();
  await navigate(page, '岗位体验');
  await page.getByRole('radio').first().check(); await page.getByRole('button', { name: '提交行动', exact: true }).click();
  await page.getByRole('button', { name: '继续下一项任务' }).click();
  await page.getByRole('radio').first().check(); await page.getByRole('button', { name: '提交行动', exact: true }).click();
  await page.getByRole('button', { name: '查看任务复盘' }).click(); await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible();
  await page.reload(); await navigate(page, '岗位体验'); await page.getByLabel('选择目标岗位').selectOption('sample-iflytek-pm');
  await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible();
});

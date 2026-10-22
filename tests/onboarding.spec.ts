import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const username = () => `N${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
const card = (page: Page) => page.locator('.tutorial-card');
async function isolate(context: BrowserContext) {
  for (const path of ['**/api/jobs/classify', '**/api/company/research']) await context.route(path, route => route.fulfill({ status: 503, json: { error: { message: '稍后可重试。' } } }));
}
test.beforeEach(async ({ context }) => isolate(context));
async function signIn(page: Page, name: string, mode = 'register') {
  await page.goto('/'); await page.getByRole('tab', { name: mode === 'register' ? '注册' : '登录', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill(name); await page.getByLabel('密码', { exact: true }).fill('123456');
  await page.getByRole('button', { name: mode === 'register' ? '注册并开始准备' : '登录并继续准备', exact: true }).click();
  await expect(page.getByRole('button', { name: '新手教程', exact: true })).toBeVisible();
}
async function status(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem('jdtool-active-account'));
  return (await (await page.request.get('/api/onboarding', { headers: { 'X-Account-Id': id! } })).json()).status;
}

test('首次登录自动展示，跳过后跨浏览器不重复，首页按钮可以重开', async ({ page, browser }) => {
  const name = username(); await signIn(page, name);
  await expect(card(page).getByRole('heading', { name: '先添加一个感兴趣的岗位' })).toBeVisible();
  for (let count = 0; count < 8; count++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.tutorial-card, [data-tour="add-jd"]'))).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(card(page)).toHaveCount(0);
  await expect.poll(() => status(page)).toBe('skipped');
  await page.reload(); await expect(page.getByRole('button', { name: '新手教程', exact: true })).toBeVisible(); await expect(card(page)).toHaveCount(0);
  const other = await browser.newContext(); await isolate(other);
  try {
    const remote = await other.newPage(); await signIn(remote, name, 'login');
    await expect(card(remote)).toHaveCount(0);
    await remote.getByRole('button', { name: '新手教程', exact: true }).click();
    await expect(card(remote).getByRole('heading', { name: '先添加一个感兴趣的岗位' })).toBeVisible();
    const originalSize = remote.viewportSize()!;
    for (const width of [320, 900, 1440]) {
      await remote.setViewportSize({ width, height: 900 });
      await expect.poll(async () => { const box = await card(remote).boundingBox(); return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 900; }).toBe(true);
      expect(await remote.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await remote.setViewportSize(originalSize);
    await remote.getByRole('button', { name: '新增JD', exact: true }).click();
    await expect(card(remote).getByRole('heading', { name: '选一种方式提供JD' })).toBeVisible();
    await card(remote).getByRole('button', { name: '跳过教程', exact: true }).click();
  } finally { await other.close(); }
});

test('教程跟随真实JD和项目，解析失败可接续，准备后把行动带回计划', async ({ page }) => {
  let companySearches = 0;
  await page.route('**/api/company/research', route => { companySearches++; return route.fulfill({ status: 503, json: { error: { message: '稍后可重试。' } } }); });
  const text = '岗位职责：分析用户需求，协调设计和研发迭代产品。任职要求：能够制定优先级和验证方案。';
  await page.route('**/api/jobs/parse', route => {
    const input = route.request().postDataJSON();
    return input.type === 'link' ? route.fulfill({ status: 502, json: { error: { message: '网页暂时无法读取，请改用截图或正文。' } } }) : route.fulfill({ json: { job: { isJobPosting: true, rawText: text, title: '产品经理', company: '目标公司', location: '上海', direction: '产品', hiringType: '校招', responsibilities: [{ text: '分析用户需求，协调设计和研发迭代产品', sourceText: '岗位职责：分析用户需求，协调设计和研发迭代产品。' }], requirements: [{ text: '能够制定优先级和验证方案', sourceText: '任职要求：能够制定优先级和验证方案。' }], warnings: [] }, sourceType: input.type, sourceUrl: '', parsedAt: new Date().toISOString() } });
  });
  await page.route('**/api/assist', route => {
    const input = route.request().postDataJSON();
    const advice = { text: '整理一个需求优先级案例', reason: '回应岗位中的优先级判断要求', requirementIds: [input.job.requirements[0].id], factIds: [], sourceIds: [] };
    return route.fulfill({ json: { priorities: [advice], strengths: [], gaps: [], companyResearch: [] } });
  });
  await signIn(page, username());
  await card(page).getByRole('button', { name: '添加我的岗位', exact: true }).click();
  await card(page).getByRole('button', { name: '开始填写', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '新手教程进度' })).toBeVisible();
  await page.getByLabel('招聘页面链接').fill('https://example.com/job'); await page.getByRole('button', { name: '读取并解析', exact: true }).click();
  await expect(page.locator('[data-tour="jd-input"]').getByRole('alert')).toContainText('网页暂时无法读取');
  await page.getByRole('button', { name: '粘贴正文', exact: true }).click(); await page.getByLabel('岗位正文', { exact: true }).fill(text);
  await page.getByRole('button', { name: '解析正文', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '对照原文，核对岗位内容' })).toBeVisible();
  await card(page).getByRole('button', { name: '开始核对', exact: true }).click();
  await page.getByLabel('岗位名称', { exact: true }).fill('产品经理实习');
  await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '看清工作内容与准备重点' })).toBeVisible();
  await card(page).getByRole('button', { name: '看看岗位如何归类', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '相似职责，会归到同一类' })).toBeVisible();
  await card(page).getByRole('button', { name: '了解公司业务', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '把岗位放回公司的业务里' })).toBeVisible();
  await card(page).getByRole('button', { name: '整理我的经历', exact: true }).click();
  await card(page).getByRole('button', { name: '开始整理项目', exact: true }).click();
  await page.getByRole('button', { name: '新增项目', exact: true }).click();
  await page.getByLabel('项目名称', { exact: true }).fill('需求研究项目'); await page.getByLabel('事实条目', { exact: true }).fill('访谈用户并整理需求优先级，产出需求清单。');
  await page.getByRole('checkbox', { name: '我已核对本人角色、项目阶段、事实与结果' }).check();
  await page.getByRole('button', { name: '保存项目事实', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '选出这个岗位最值得讲的经历' })).toBeVisible();
  await card(page).getByRole('button', { name: '查看面试准备', exact: true }).click();
  await card(page).getByRole('button', { name: '先试着操作', exact: true }).click();
  await page.getByRole('button', { name: '生成岗位准备卡', exact: true }).click();
  await page.getByRole('button', { name: '加入我的计划', exact: true }).click();
  await page.getByRole('button', { name: '继续教程', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '用回答和行动检验准备' })).toBeVisible();
  await card(page).getByRole('button', { name: '安排我的下一步', exact: true }).click();
  await expect(page.locator('[data-tour="weekly-plan"]')).toContainText('整理一个需求优先级案例');
  await card(page).getByRole('button', { name: '开始准备', exact: true }).click();
  await expect(card(page)).toHaveCount(0); await expect.poll(() => status(page)).toBe('completed');
  await expect(page.getByRole('heading', { name: '岗位准备卡', exact: true })).toBeVisible();
  const id = await page.evaluate(() => localStorage.getItem('jdtool-active-account'));
  await expect.poll(async () => (await (await page.request.get('/api/workspace', { headers: { 'X-Account-Id': id! } })).json()).data.jobs.length).toBe(1);
  const data = (await (await page.request.get('/api/workspace', { headers: { 'X-Account-Id': id! } })).json()).data;
  expect(data.jobs[0].sample).not.toBe(true); expect(data.projects).toHaveLength(1); expect(data.projects[0].confirmed).toBe(true);
  expect(companySearches).toBe(1);
});

test('没有简历时可以先了解后续，手动草稿保存后能继续教程', async ({ page }) => {
  await signIn(page, username()); await card(page).getByRole('button', { name: '添加我的岗位', exact: true }).click();
  // Clicking the highlighted form directly also clears the mask for editing.
  await page.getByRole('tab', { name: '粘贴正文', exact: true }).click();
  await expect(card(page)).toHaveCount(0);
  await page.getByLabel('岗位正文', { exact: true }).fill('负责需求调研、产品方案与迭代安排。');
  await page.getByRole('button', { name: '手动整理为草稿', exact: true }).click();
  await card(page).getByRole('button', { name: '开始核对', exact: true }).click(); await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  for (const name of ['看看岗位如何归类', '了解公司业务', '整理我的经历', '先了解后续流程', '查看面试准备', '了解两种练习方式', '安排我的下一步', '开始准备']) await card(page).getByRole('button', { name, exact: true }).click();
  await expect(card(page)).toHaveCount(0); await expect.poll(() => status(page)).toBe('completed');
  await page.getByRole('button', { name: '返回首页', exact: true }).click();
  await page.getByRole('button', { name: '新手教程', exact: true }).click();
  await card(page).getByRole('button', { name: '用已有岗位继续', exact: true }).click();
  await expect(card(page).getByRole('heading', { name: '看清工作内容与准备重点' })).toBeVisible();
  await card(page).getByRole('button', { name: '跳过教程', exact: true }).click();
});

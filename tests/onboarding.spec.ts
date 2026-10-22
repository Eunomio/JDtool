import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const username = () => `N${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
const card = (page: Page) => page.locator('.tutorial-card');
const caseView = (page: Page) => page.getByTestId('tutorial-workspace');
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
async function state(page: Page, endpoint = 'onboarding') {
  const id = await page.evaluate(() => localStorage.getItem('jdtool-active-account'));
  const response = await page.request.get(`/api/${endpoint}`, { headers: { 'X-Account-Id': id! } });
  expect(response.ok()).toBe(true); return response.json();
}
async function advanceTo(page: Page, target: string) {
  for (let index = 0; index < 11; index++) {
    if (await page.locator(`.tutorial-layer[data-step="${target}"]`).count()) return;
    await card(page).locator('.tutorial-card-actions > .primary').click();
  }
  throw Error(`Missing tutorial step: ${target}`);
}
async function backup(page: Page) {
  await page.getByText('资料备份', { exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份', exact: true }).click();
  return JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
}

test('首次自动展示与跨浏览器记录保留，首页可重开，手机蒙版与键盘可用', async ({ page, browser }) => {
  const name = username(); await signIn(page, name);
  await expect(card(page).getByRole('heading', { name: '先用案例看懂准备流程' })).toBeVisible();
  for (let count = 0; count < 8; count++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.tutorial-card, [data-tour="add-jd"]'))).toBe(true);
  }
  await page.keyboard.press('Escape'); await expect(card(page)).toHaveCount(0);
  await expect.poll(async () => (await state(page)).status).toBe('skipped');
  await page.reload(); await expect(page.getByRole('button', { name: '新手教程', exact: true })).toBeVisible(); await expect(caseView(page)).toHaveCount(0);
  const other = await browser.newContext(); await isolate(other);
  try {
    const remote = await other.newPage(); await signIn(remote, name, 'login'); await expect(card(remote)).toHaveCount(0);
    await remote.getByRole('button', { name: '新手教程', exact: true }).click();
    for (const width of [320, 900, 1440]) {
      await remote.setViewportSize({ width, height: 900 });
      await expect.poll(async () => { const box = await card(remote).boundingBox(); return !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= 900; }).toBe(true);
      expect(await remote.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await remote.getByRole('button', { name: '新增JD', exact: true }).click();
    await expect(card(remote).getByRole('heading', { name: '选一种方式提供JD' })).toBeVisible();
    await card(remote).getByRole('button', { name: '上一步', exact: true }).click();
    await expect(card(remote).getByRole('heading', { name: '先用案例看懂准备流程' })).toBeVisible();
    await card(remote).getByRole('button', { name: '跳过教程', exact: true }).click(); await expect(caseView(remote)).toHaveCount(0);
  } finally { await other.close(); }
});

test('空账号无需填写或生成就能浏览全部案例，账号缓存和备份保持空白', async ({ page }) => {
  if (test.info().project.name === 'mobile') await page.setViewportSize({ width: 320, height: 844 });
  const generated: string[] = [];
  for (const path of ['jobs/parse', 'jobs/classify', 'company/research', 'assist', 'project-recommendations', 'sources/extract', 'documents/read']) await page.route(`**/api/${path}`, route => { generated.push(path); return route.fulfill({ status: 503, json: { error: { message: '教程不应调用此服务。' } } }); });
  await signIn(page, username()); const before = await state(page, 'workspace');
  await expect(caseView(page)).toContainText('岗位、公司与项目均为虚构案例');
  for (const step of ['input', 'review', 'requirements', 'category', 'company', 'projects', 'match', 'preparation', 'practice', 'plan']) {
    await card(page).locator('.tutorial-card-actions > .primary').click();
    await expect(page.locator('.tutorial-layer')).toHaveAttribute('data-step', step);
    await expect(page.locator('.tutorial-spotlight')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (step === 'review') await expect(caseView(page).getByLabel('岗位名称', { exact: true })).toHaveValue('交互设计师（协作产品）');
    if (step === 'match') await expect(caseView(page)).toContainText('校园活动报名流程优化');
  }
  await card(page).getByRole('button', { name: '返回首页', exact: true }).click();
  await expect(caseView(page)).toHaveCount(0); await expect.poll(async () => (await state(page)).status).toBe('completed');
  expect(await state(page, 'workspace')).toEqual(before); expect(generated).toEqual([]);
  const exported = await backup(page);
  for (const table of ['jobs', 'projects', 'sources', 'recommendations', 'preparations', 'companies', 'comparisons', 'tasks', 'practice']) expect(exported[table]).toEqual([]);
  expect(JSON.stringify(exported)).not.toContain('tutorial-job');
});

test('案例中的采用、加入计划和完成只在本次教程生效，重开会清除', async ({ page }) => {
  await signIn(page, username()); await advanceTo(page, 'match');
  await card(page).getByRole('button', { name: '自由查看案例', exact: true }).click();
  await caseView(page).getByRole('checkbox', { name: '已核对，采用这条表述' }).check();
  await page.getByRole('complementary', { name: '新手教程进度' }).getByRole('button', { name: '下一步', exact: true }).click();
  await card(page).getByRole('button', { name: '自由查看案例', exact: true }).click();
  await caseView(page).getByRole('button', { name: '加入我的计划', exact: true }).first().click();
  await expect(caseView(page).getByRole('button', { name: '已加入计划', exact: true })).toBeVisible();
  await page.getByRole('complementary', { name: '新手教程进度' }).getByRole('button', { name: '下一步', exact: true }).click();
  await card(page).getByRole('button', { name: '下一步', exact: true }).click();
  await card(page).getByRole('button', { name: '自由查看案例', exact: true }).click();
  const plan = caseView(page).locator('[data-tour="weekly-plan"]'); await expect(plan.getByRole('checkbox')).toHaveCount(3);
  await plan.getByRole('checkbox').first().check(); await expect(plan.locator('.count')).toHaveText('1 / 3');
  await page.keyboard.press('Escape'); await expect(caseView(page)).toHaveCount(0);
  const data = (await state(page, 'workspace')).data; expect(data.tasks).toEqual([]); expect(data.projects).toEqual([]);
  await page.getByRole('button', { name: '新手教程', exact: true }).click(); await advanceTo(page, 'match');
  await expect(caseView(page).getByRole('checkbox', { name: '已核对，采用这条表述' })).not.toBeChecked();
  await advanceTo(page, 'plan'); await expect(caseView(page).locator('[data-tour="weekly-plan"] .count')).toHaveText('0 / 2');
  await card(page).getByRole('button', { name: '返回首页', exact: true }).click();
});

test('随时改用自己的JD，保存的是本人岗位，已有资料不被案例覆盖', async ({ page }) => {
  await signIn(page, username()); await card(page).getByRole('button', { name: '用自己的JD试一试', exact: true }).click();
  await expect(caseView(page)).toHaveCount(0); await expect(page.getByLabel('招聘页面链接')).toHaveValue('');
  await page.getByRole('tab', { name: '粘贴正文', exact: true }).click(); await page.getByLabel('岗位正文', { exact: true }).fill('负责产品需求分析、跨团队协作与迭代安排。');
  await page.getByRole('button', { name: '手动整理为草稿', exact: true }).click(); await page.getByLabel('岗位名称', { exact: true }).fill('我的产品经理岗位');
  await page.getByRole('button', { name: '保存岗位', exact: true }).click(); await expect(page.getByRole('heading', { name: '我的产品经理岗位', exact: true })).toBeVisible();
  await expect(page.locator('.account-save')).toHaveAttribute('data-state', 'saved');
  const before = await state(page, 'workspace');
  await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.getByRole('button', { name: '新手教程', exact: true }).click(); await advanceTo(page, 'company');
  await card(page).getByRole('button', { name: '跳过教程', exact: true }).click();
  expect(await state(page, 'workspace')).toEqual(before);
  const exported = await backup(page); expect(exported.jobs).toHaveLength(1); expect(exported.jobs[0].title).toBe('我的产品经理岗位'); expect(exported.projects).toEqual([]);
});

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { retiredImportedJobIds } from '../lib/legacy-cleanup';

const username = () => `U${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
async function isolate(context: BrowserContext) {
  for (const path of ['**/api/jobs/classify', '**/api/company/research', '**/api/assist']) await context.route(path, route => route.fulfill({ status: 503, json: { error: { message: '稍后可重试。' } } }));
}
test.beforeEach(async ({ context }) => isolate(context));
async function nav(page: Page, name: string) {
  await page.getByRole('button', { name: '新增JD', exact: true }).first().waitFor();
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: '更多功能', exact: true }).click();
  await button.click();
}
async function signIn(page: Page, name: string, mode: 'login' | 'register' = 'register', password = '123456') {
  await page.goto('/'); await page.getByRole('tab', { name: mode === 'login' ? '登录' : '注册', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill(name); await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: mode === 'login' ? '登录并继续准备' : '注册并开始准备', exact: true }).click();
  await expect(page.getByRole('button', { name: '返回首页', exact: true })).toBeVisible();
  await expect.poll(async () => { const id = await page.evaluate(() => localStorage.getItem('jdtool-active-account')); return (await (await page.request.get('/api/onboarding', { headers: { 'X-Account-Id': id! } })).json()).seen; }).toBe(true);
  const close = page.getByRole('button', { name: '关闭新手教程', exact: true });
  if (mode === 'register') await expect(close).toBeVisible();
  if (await close.isVisible()) await close.click();
}
async function addJob(page: Page, title: string) {
  await page.getByRole('button', { name: '新增JD', exact: true }).first().click(); await page.getByRole('tab', { name: '粘贴正文', exact: true }).click();
  await page.getByLabel('岗位正文', { exact: true }).fill('岗位职责：负责需求分析与产品规划，协调设计和研发推进产品迭代。');
  await page.getByRole('button', { name: '手动整理为草稿', exact: true }).click(); await page.getByLabel('岗位名称', { exact: true }).fill(title); await page.getByLabel('公司名称', { exact: true }).fill('个人公司');
  await page.getByRole('button', { name: '保存岗位', exact: true }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('.account-save')).toHaveAttribute('data-state', 'saved');
}

test('注册和登录只有两个字段，重复账号与错误密码显示清楚，普通账号从空白首页开始', async ({ page, context }) => {
  await page.goto('/'); await expect(page.getByRole('heading', { name: '欢迎回来', exact: true })).toBeVisible(); expect(await page.locator('form input').count()).toBe(2);
  await page.getByRole('tab', { name: '注册', exact: true }).click(); await page.getByLabel('账号', { exact: true }).fill('p01'); await page.getByLabel('密码', { exact: true }).fill('123456'); await page.getByRole('button', { name: '注册并开始准备' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('已被使用');
  await signIn(page, username());
  await expect(page.getByRole('button', { name: '首页', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('从一个感兴趣的岗位开始', { exact: true })).toBeVisible();
  await nav(page, '岗位清单'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toHaveCount(0);
  await nav(page, '我的项目'); await expect(page.getByRole('button', { name: '使用脱敏示例项目' })).toHaveCount(0);
  await context.clearCookies(); await page.goto('/'); await page.getByLabel('账号', { exact: true }).fill('P01'); await page.getByLabel('密码', { exact: true }).fill('wrong'); await page.getByRole('button', { name: '登录并继续准备' }).click(); await expect(page.locator('main').getByRole('alert')).toContainText('账号或密码不正确');
});

test('账号资料跨浏览器保留，切换账号后看不到上一个账号的岗位或项目', async ({ page, browser }) => {
  const first = username(); const second = username(); const title = `我的产品岗位${first.slice(-4)}`;
  await signIn(page, first); await addJob(page, title);
  const other = await browser.newContext(); await isolate(other);
  try {
    const same = await other.newPage(); await signIn(same, first, 'login'); await nav(same, '岗位清单'); await expect(same.getByRole('button', { name: title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回首页', exact: true }).click(); await page.locator('.account-menu > summary').click(); await page.getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page.getByRole('heading', { name: '欢迎回来', exact: true })).toBeVisible();
    await signIn(page, second); await nav(page, '岗位清单'); await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.getByRole('heading', { name: '岗位清单', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await expect(same.getByRole('button', { name: title, exact: true })).toBeVisible();
  } finally { await other.close(); }
});

test('首页、清单和详情分别高亮，可用标识返回首页并在详情切换岗位', async ({ page }) => {
  await signIn(page, username()); await addJob(page, '岗位甲'); await addJob(page, '岗位乙');
  await expect(page.getByRole('button', { name: '岗位详情', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByLabel('当前岗位', { exact: true }).selectOption({ label: '个人公司 · 岗位甲' }); await expect(page.getByRole('heading', { name: '岗位甲', exact: true })).toBeVisible();
  await nav(page, '岗位清单'); await expect(page.getByRole('heading', { name: '岗位清单', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '岗位清单', exact: true })).toHaveAttribute('aria-current', 'page'); await expect(page.locator('.dashboard-hero')).toHaveCount(0);
  await page.getByRole('button', { name: '返回首页', exact: true }).click(); await expect(page.getByRole('heading', { name: '把机会，变成下一步。', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '首页', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav(page, '岗位详情'); await expect(page.getByRole('heading', { name: '岗位甲', exact: true })).toBeVisible(); await page.reload(); await expect(page.getByRole('heading', { name: '岗位甲', exact: true })).toBeVisible();
});

test('手机、平板与桌面没有整页横向溢出，导航与表单始终可操作', async ({ page }) => {
  const initial = page.viewportSize()!;
  await page.goto('/'); await expect(page.getByRole('heading', { name: '欢迎回来', exact: true })).toBeVisible();
  for (const width of [320, 600, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
  await page.setViewportSize(initial);
  await signIn(page, username()); await addJob(page, '长岗位名称与跨团队需求分析产品经理ProductManager');
  for (const width of [320, 390, 600, 767, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const destination of ['首页', '岗位清单', '岗位详情', '我的项目', '岗位比较']) {
      await nav(page, destination); await expect(page.locator('main.app-main')).toBeVisible();
      const dimensions = await page.evaluate(() => ({ visible: innerWidth, full: document.documentElement.scrollWidth })); expect(dimensions.full, `${width}px / ${destination}`).toBeLessThanOrEqual(dimensions.visible);
    }
    if (width <= 767) { await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible(); await page.getByRole('button', { name: '更多功能', exact: true }).click(); await expect(page.getByRole('dialog', { name: '更多功能' })).toBeVisible(); await page.getByRole('button', { name: '关闭更多功能', exact: true }).click(); }
  }
});

test('网络暂时不可用时保留岗位，恢复连接并刷新后继续保存到账号', async ({ page, context, browser }) => {
  const name = username(); await signIn(page, name);
  let offline = true;
  await context.route('**/api/workspace', route => route.request().method() === 'POST' && offline ? route.fulfill({ status: 503, json: { error: { message: '暂时无法保存到账号。' } } }) : route.continue());
  await page.getByRole('button', { name: '新增JD', exact: true }).first().click(); await page.getByRole('tab', { name: '粘贴正文', exact: true }).click(); await page.getByLabel('岗位正文', { exact: true }).fill('负责需求分析、优先级判断和跨团队产品迭代工作。'); await page.getByRole('button', { name: '手动整理为草稿' }).click(); await page.getByLabel('岗位名称', { exact: true }).fill('等待保存的岗位'); await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  await expect(page.locator('.account-sync-notice')).toContainText('暂时无法保存');
  offline = false; await page.reload(); await expect(page.getByRole('heading', { name: '等待保存的岗位', exact: true })).toBeVisible(); await expect(page.locator('.account-save')).toHaveAttribute('data-state', 'saved');
  const other = await browser.newContext(); await isolate(other);
  try { const remote = await other.newPage(); await signIn(remote, name, 'login'); await nav(remote, '岗位清单'); await expect(remote.getByRole('button', { name: '等待保存的岗位', exact: true })).toBeVisible(); }
  finally { await other.close(); }
});

test('清理两条旧导入及关联资料，旧浏览器岗位不向新账号提供导入', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async retiredIds => {
    const now = new Date().toISOString();
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('jdtool', 1); request.onupgradeneeded = () => { for (const name of ['jobs', 'projects', 'sources', 'comparisons', 'tasks']) request.result.createObjectStore(name, { keyPath: 'id' }); }; request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => {
      const tx = db.transaction(['jobs', 'projects', 'sources', 'comparisons', 'tasks'], 'readwrite'); const table = tx.objectStore('jobs'); const job = { id: 'legacy-personal', title: '旧版个人岗位', company: '旧版公司', content: '负责用户研究和需求分析工作，并制定产品改进方案。', status: '面试中', nextAction: '', createdAt: now, updatedAt: now }; table.put(job); table.put({ ...job, id: 'sample-old', title: '旧版示例岗位', sample: true });
      for (const id of retiredIds) { table.put({ ...job, id }); tx.objectStore('sources').put({ id, jobId: id }); }
      tx.objectStore('projects').put({ id: 'keep-project' }); tx.objectStore('sources').put({ id: 'keep-source', jobId: job.id });
      tx.objectStore('comparisons').put({ id: 'remove-comparison', jobId: `${retiredIds[0]}|${job.id}` });
      tx.objectStore('tasks').put({ id: 'remove-task', jobIds: [...retiredIds] }); tx.objectStore('tasks').put({ id: 'keep-task', jobIds: [retiredIds[0], job.id] });
      tx.oncomplete = () => resolve();
    }); db.close();
  }, retiredImportedJobIds);
  for (let index = 0; index < 2; index++) {
    await signIn(page, username());
    await expect(page.getByRole('button', { name: '导入旧资料', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '导出旧资料', exact: true })).toHaveCount(0);
    await nav(page, '岗位清单'); await expect(page.getByRole('button', { name: '旧版个人岗位', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: '旧版示例岗位', exact: true })).toHaveCount(0);
    const saved = await page.evaluate(async () => (await (await fetch('/api/workspace', { headers: { 'X-Account-Id': localStorage.getItem('jdtool-active-account')! } })).json()).data);
    expect(saved.jobs).toEqual([]); expect(saved.projects).toEqual([]);
    await page.locator('.account-menu > summary').click(); await page.getByRole('button', { name: '退出登录', exact: true }).click(); await expect(page.getByRole('heading', { name: '欢迎回来', exact: true })).toBeVisible();
  }
  const remaining = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('jdtool'); request.onsuccess = () => resolve(request.result); });
    try { return await Promise.all(['jobs', 'projects', 'sources', 'comparisons', 'tasks'].map(name => new Promise<any[]>(resolve => { const request = db.transaction(name).objectStore(name).getAll(); request.onsuccess = () => resolve(request.result); }))); } finally { db.close(); }
  });
  expect(remaining[0].map(row => row.id).sort()).toEqual(['legacy-personal', 'sample-old']); expect(remaining[1]).toEqual([{ id: 'keep-project' }]); expect(remaining[2]).toEqual([{ id: 'keep-source', jobId: 'legacy-personal' }]); expect(remaining[3]).toEqual([]); expect(remaining[4]).toEqual([{ id: 'keep-task', jobIds: ['legacy-personal'] }]);
});

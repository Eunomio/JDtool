import { expect, test, type Page, navigate } from './fixtures';
import { roleInputVersion, type RoleClassification } from '../lib/role-taxonomy';

const now = new Date().toISOString();
const jobs = [
  { id: 'ux-a', title: '交互设计师', company: '甲公司', content: '负责用户任务流程与交互原型设计，开展可用性测试并迭代体验方案。' },
  { id: 'ux-b', title: '体验设计师', company: '乙公司', content: '负责信息架构与用户流程，设计交互原型，组织可用性测试并优化操作体验。' },
  { id: 'research-c', title: '用户研究工程师', company: '丙公司', content: '负责用户访谈与实验设计，采集眼动和脑电数据，通过统计分析验证研究假设。' },
].map((job, index) => ({ ...job, status: '面试中' as const, nextAction: '准备一个代表项目', direction: job.title, hiringType: index === 1 ? '校招' : '校园招聘', createdAt: now, updatedAt: now }));

function classification(job: typeof jobs[number], index: number): RoleClassification {
  return { categoryId: index < 2 ? 'experience_design' : 'user_research', confidence: index === 1 ? 'low' : 'high', reason: index < 2 ? '工作内容侧重用户流程与交互方案，属于用户体验设计。' : '工作内容以研究实验和数据分析为主，属于用户研究。', evidence: [job.content.split('，')[0]], inputVersion: roleInputVersion(job), classifiedAt: now };
}
function result(input: { jobs: typeof jobs }) {
  return { classifications: input.jobs.map(job => ({ jobId: job.id, classification: classification(job, jobs.findIndex(row => row.id === job.id)) })) };
}
async function seed(page: Page, classified = false) {
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('选择备份文件').setInputFiles({ name: 'categories.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs: jobs.map((job, index) => ({ ...job, ...(classified ? { classification: classification(job, index) } : {}) })) })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
  await navigate(page, '岗位归类');
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const opening = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`); opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    try { return await new Promise<{ id: string; title: string; content: string; status: string; hiringType?: string; updatedAt: string; classification?: RoleClassification; categoryOverride?: string }[]>(resolve => { const request = db.transaction('jobs').objectStore('jobs').getAll(); request.onsuccess = () => resolve(request.result); }); }
    finally { db.close(); }
  });
}

test('旧岗位自动按JD直接归类，无需确认，刷新不重复分析且可按同类筛选', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/jobs/classify', async route => {
    calls++; const input = route.request().postDataJSON(); expect(input.jobs).toHaveLength(3);
    expect(input.jobs.every((job: Record<string, unknown>) => !job.images && !job.projects && !job.company)).toBe(true);
    await route.fulfill({ json: result(input) });
  });
  await seed(page);
  await expect(page.getByText('已自动归类3个岗位，可直接筛选和比较。')).toBeVisible();
  expect((await saved(page)).every(job => job.classification && job.hiringType === '校招')).toBe(true);
  await expect(page.getByRole('button', { name: /应用建议|确认分类/ })).toHaveCount(0);
  await page.locator('.classification-card').filter({ has: page.getByLabel('选择归类 甲公司 交互设计师') }).getByText('查看JD原句依据', { exact: true }).click(); await expect(page.getByText('负责用户任务流程与交互原型设计', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '岗位清单', exact: true }).click(); await page.reload();
  await page.getByLabel('按职位大类筛选').selectOption('experience_design');
  await expect(page.getByRole('button', { name: '交互设计师', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '体验设计师', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '用户研究工程师', exact: true })).toHaveCount(0);
  expect(calls).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.primary').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(36, 82, 232)');
});

test('手动合并直接保存，保留原始JD与投递状态，并可撤销和导出归类依据', async ({ page }) => {
  await seed(page, true);
  await page.getByLabel('选择归类 甲公司 交互设计师').check(); await page.getByLabel('选择归类 丙公司 用户研究工程师').check();
  await page.getByLabel('合并到', { exact: true }).selectOption('experience_design');
  await page.getByRole('button', { name: '合并所选岗位（2）' }).click(); await expect(page.getByText('已将2个岗位归入“用户体验设计”。')).toBeVisible();
  const merged = await saved(page); expect(merged.find(job => job.id === 'research-c')?.categoryOverride).toBe('experience_design');
  for (const original of jobs) expect(merged.find(job => job.id === original.id)).toMatchObject({ title: original.title, content: original.content, status: '面试中' });
  await page.getByRole('button', { name: '撤销本次调整' }).click(); await expect(page.getByText('已撤销本次分类调整。')).toBeVisible();
  expect((await saved(page)).find(job => job.id === 'research-c')?.categoryOverride).toBeUndefined();
  await page.getByText('资料备份', { exact: true }).click(); const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份' }).click();
  const { readFile } = await import('node:fs/promises'); const downloaded = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(downloaded.jobs.find((job: { id: string }) => job.id === 'research-c').classification).toMatchObject({ categoryId: 'user_research', evidence: ['负责用户访谈与实验设计'] });
  expect(downloaded.jobs.every((job: { hiringType: string }) => job.hiringType === '校招')).toBe(true);
});

test('分析期间修改JD或删除岗位时跳过旧结果，保留最新投递状态且失败不循环请求', async ({ page }) => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  await page.route('**/api/jobs/classify', async route => {
    calls++;
    if (calls > 1) { await route.fulfill({ status: 503, json: { error: {} } }); return; }
    const input = route.request().postDataJSON(); await wait; await route.fulfill({ json: result(input) });
  });
  await seed(page); await expect.poll(() => calls).toBe(1);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`); request.onsuccess = () => resolve(request.result); });
    try { await new Promise<void>(resolve => { const tx = db.transaction('jobs', 'readwrite'); const table = tx.objectStore('jobs'); table.delete('ux-b'); const request = table.get('research-c'); request.onsuccess = () => table.put({ ...request.result, content: '新的岗位正文：负责后端接口开发与数据库事务设计。' }); const status = table.get('ux-a'); status.onsuccess = () => table.put({ ...status.result, status: '已投递' }); tx.oncomplete = () => resolve(); }); } finally { db.close(); }
  });
  release();
  await expect(page.locator('main').getByRole('alert')).toContainText('部分岗位还未完成归类');
  const records = await saved(page); expect(records).toHaveLength(2);
  expect(records.find(job => job.id === 'ux-a')).toMatchObject({ status: '已投递', classification: { categoryId: 'experience_design' } });
  expect(records.find(job => job.id === 'research-c')).toMatchObject({ content: '新的岗位正文：负责后端接口开发与数据库事务设计。' });
  expect(records.find(job => job.id === 'research-c')?.classification).toBeUndefined();
  await page.getByRole('button', { name: '选择全部', exact: true }).click(); expect(calls).toBe(2);
});

test('自动归类失败后可直接重试并保存，无需应用建议', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/jobs/classify', async route => {
    calls++; await route.fulfill(calls === 1 ? { status: 503, json: { error: {} } } : { json: result(route.request().postDataJSON()) });
  });
  await seed(page); await expect(page.locator('main').getByRole('alert')).toContainText('部分岗位还未完成归类');
  expect(calls).toBe(1); await page.getByRole('button', { name: '重新分析全部JD' }).click();
  await expect(page.getByText('已自动归类3个岗位，可直接筛选和比较。')).toBeVisible();
  expect((await saved(page)).every(job => job.classification)).toBe(true); expect(calls).toBe(2);
});

test('历史数据库中的校园招聘自动统一，手动编辑保存也使用校招', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const opening = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`); opening.onsuccess = () => resolve(opening.result); });
    try { await new Promise<void>(resolve => { const tx = db.transaction('jobs', 'readwrite'); const table = tx.objectStore('jobs'); const request = table.get('ux-a'); request.onsuccess = () => table.put({ ...request.result, hiringType: '校园招聘' }); tx.oncomplete = () => resolve(); }); } finally { db.close(); }
  });
  await page.reload(); await page.getByRole('button', { name: '岗位清单', exact: true }).click(); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  expect((await saved(page)).every(job => job.hiringType === '校招')).toBe(true);
  expect((await saved(page)).every(job => job.updatedAt === now)).toBe(true);
  await page.getByRole('button', { name: '交互设计师', exact: true }).click(); await page.getByRole('button', { name: '编辑JD', exact: true }).click();
  await page.getByLabel('招聘类型', { exact: true }).fill('校园招聘'); await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  await expect(page.getByRole('button', { name: '编辑JD', exact: true })).toBeVisible();
  expect((await saved(page)).find(job => job.id === 'ux-a')?.hiringType).toBe('校招');
});

test('两个标签页同时自动归类时共用已保存的结果', async ({ page, context }) => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  await context.route('**/api/jobs/classify', async route => { calls++; const input = route.request().postDataJSON(); await wait; await route.fulfill({ json: result(input) }); });
  await seed(page); await expect.poll(() => calls).toBe(1);
  const other = await context.newPage(); await other.goto('/');
  await expect(other.getByText('正在自动整理岗位类别', { exact: false })).toBeVisible();
  release(); await expect(page.getByText('已自动归类3个岗位，可直接筛选和比较。')).toBeVisible();
  await expect(other.getByText('正在自动整理岗位类别', { exact: false })).toHaveCount(0);
  await other.getByLabel('按职位大类筛选').selectOption('experience_design'); await expect(other.getByRole('button', { name: '体验设计师', exact: true })).toBeVisible();
  expect(calls).toBe(1); await other.close();
});

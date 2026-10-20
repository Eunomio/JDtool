import { expect, test, type Page } from './fixtures';
import { roleInputVersion, type RoleClassification } from '../lib/role-taxonomy';

const now = new Date().toISOString();
const jobs = [
  { id: 'ux-a', title: '交互设计师', company: '甲公司', content: '负责用户任务流程与交互原型设计，开展可用性测试并迭代体验方案。', quote: '负责用户任务流程与交互原型设计', category: 'experience_design' },
  { id: 'ux-b', title: '体验设计师', company: '乙公司', content: '负责信息架构与用户流程，设计交互原型，组织可用性测试并优化操作体验。', quote: '负责信息架构与用户流程', category: 'experience_design' },
  { id: 'research-c', title: '用户研究工程师', company: '丙公司', content: '负责用户访谈与实验设计，采集眼动和脑电数据，通过统计分析验证研究假设。', quote: '负责用户访谈与实验设计', category: 'user_research' },
].map(({ quote, category, ...job }) => ({ ...job, status: '面试中' as const, nextAction: '准备一个代表项目', direction: job.title, createdAt: now, updatedAt: now }));

function classification(job: typeof jobs[number], index: number): RoleClassification {
  return { categoryId: index < 2 ? 'experience_design' : 'user_research', confidence: 'high', reason: index < 2 ? '工作内容侧重用户流程与交互方案，属于用户体验设计。' : '工作内容以研究实验和数据分析为主，属于用户研究。', evidence: [job.content.split('，')[0]], inputVersion: roleInputVersion(job), classifiedAt: now };
}
async function seed(page: Page, classified = false) {
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('选择备份文件').setInputFiles({ name: 'categories.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs: jobs.map((job, index) => ({ ...job, ...(classified ? { classification: classification(job, index) } : {}) })) })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
  await page.getByRole('button', { name: '岗位归类', exact: true }).click();
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const opening = indexedDB.open('jdtool'); opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    try { return await new Promise<{ id: string; title: string; content: string; status: string; classification?: RoleClassification; categoryOverride?: string }[]>(resolve => { const request = db.transaction('jobs').objectStore('jobs').getAll(); request.onsuccess = () => resolve(request.result); }); }
    finally { db.close(); }
  });
}
async function mockClassification(page: Page) {
  await page.route('**/api/jobs/classify', async route => {
    const input = route.request().postDataJSON(); expect(input.jobs).toHaveLength(3);
    expect(input.jobs.every((job: Record<string, unknown>) => !job.images && !job.projects && !job.company)).toBe(true);
    await route.fulfill({ json: { classifications: input.jobs.map((job: typeof jobs[number]) => ({ jobId: job.id, classification: classification(job, jobs.findIndex(row => row.id === job.id)) })) } });
  });
}

test('不同名称按JD归到同类，预览后应用，刷新与筛选仍使用标准类别', async ({ page }) => {
  await mockClassification(page); await seed(page);
  await page.getByRole('button', { name: '分析所选JD并归类' }).click();
  await expect(page.getByText('归类建议已准备好，核对依据后即可应用。')).toBeVisible();
  expect((await saved(page)).every(job => !job.classification)).toBe(true);
  await page.locator('.classification-card').filter({ has: page.getByLabel('选择归类 甲公司 交互设计师') }).getByText('查看JD原句依据', { exact: true }).click(); await expect(page.getByText('负责用户任务流程与交互原型设计', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '应用建议分类（3）' }).click();
  await expect(page.getByText('已应用3个岗位的分类建议。')).toBeVisible();
  await page.getByRole('button', { name: '岗位清单', exact: true }).click(); await page.reload();
  await page.getByLabel('按职位大类筛选').selectOption('experience_design');
  await expect(page.getByRole('button', { name: '交互设计师', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '体验设计师', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '用户研究工程师', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('.primary').first().evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(36, 82, 232)');
});

test('合并前显示预览，保留原始JD与投递状态，并可撤销和导出归类依据', async ({ page }) => {
  await seed(page, true);
  await page.getByLabel('选择归类 甲公司 交互设计师').check(); await page.getByLabel('选择归类 丙公司 用户研究工程师').check();
  await page.getByLabel('合并到', { exact: true }).selectOption('experience_design');
  await page.getByRole('button', { name: '预览合并（2）' }).click();
  expect((await saved(page)).every(job => !job.categoryOverride)).toBe(true);
  await page.getByRole('button', { name: '确认合并分类' }).click(); await expect(page.getByText('已将2个岗位归入“用户体验设计”。')).toBeVisible();
  const merged = await saved(page); expect(merged.find(job => job.id === 'research-c')?.categoryOverride).toBe('experience_design');
  for (const original of jobs) expect(merged.find(job => job.id === original.id)).toMatchObject({ title: original.title, content: original.content, status: '面试中' });
  await page.getByRole('button', { name: '撤销本次调整' }).click(); await expect(page.getByText('已撤销本次分类调整。')).toBeVisible();
  expect((await saved(page)).find(job => job.id === 'research-c')?.categoryOverride).toBeUndefined();
  await page.getByText('资料备份', { exact: true }).click(); const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份' }).click();
  const { readFile } = await import('node:fs/promises'); const downloaded = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'));
  expect(downloaded.jobs.find((job: { id: string }) => job.id === 'research-c').classification).toMatchObject({ categoryId: 'user_research', evidence: ['负责用户访谈与实验设计'] });
});

test('预览后JD被另一页面修改时整批拒绝应用，保留新正文与原分类', async ({ page }) => {
  await mockClassification(page); await seed(page);
  await page.getByRole('button', { name: '分析所选JD并归类' }).click(); await expect(page.getByText('归类建议已准备好，核对依据后即可应用。')).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('jdtool'); request.onsuccess = () => resolve(request.result); });
    try { await new Promise<void>(resolve => { const tx = db.transaction('jobs', 'readwrite'); const table = tx.objectStore('jobs'); const request = table.get('research-c'); request.onsuccess = () => table.put({ ...request.result, content: '新的岗位正文：负责后端接口开发与数据库事务设计。' }); tx.oncomplete = () => resolve(); }); } finally { db.close(); }
  });
  await page.getByRole('button', { name: '应用建议分类（3）' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('刚刚被修改或移除');
  const records = await saved(page); expect(records.every(job => !job.classification)).toBe(true); expect(records.find(job => job.id === 'research-c')?.content).toContain('新的岗位正文');
});

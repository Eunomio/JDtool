import { test, expect, type Page } from './fixtures';
import { inputVersion } from '../lib/input-version';

const now = '2026-10-25T08:00:00.000Z';
const job = { id: 'audit-job', title: '产品经理', company: '星桥协作', content: '负责用户研究与需求分析。', requirements: [{ id: 'r1', text: '用户研究', sourceText: '用户研究' }], responsibilities: [], status: '关注中', nextAction: '', createdAt: now, updatedAt: now };
const source = { id: 'audit-source', jobId: job.id, label: '公司公开资料', url: 'https://example.com/products', text: '星桥协作为企业团队提供项目协作工具。', collectedAt: now };
const company = { facts: [], businesses: [], roleInsights: [], hypotheses: [], questions: [], research: { company: job.company, summary: '星桥协作提供协作工具。', identityNote: '', queries: [], searchedAt: now } };
const project = { id: 'audit-project', name: '报名工具', type: '课程项目', stage: '已测试', timeline: '', role: '产品设计', problem: '', actions: '', methods: '', results: '', skills: [], facts: [{ id: 'f1', text: '访谈三位用户', sourceText: '访谈三位用户', category: 'action' }], sources: [], confirmed: true, visibility: 'private', redactions: [], updatedAt: now };

async function restore(page: Page, data: object) {
  await page.goto('/#jobs'); await expect(page.getByRole('button', { name: '体验6个示例岗位', exact: true })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'audit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs: [job], ...data })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
}
async function records(page: Page, table: string) {
  return page.evaluate(table => new Promise<any[]>((resolve, reject) => { const open = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const read = db.transaction(table).objectStore(table).getAll(); read.onsuccess = () => { resolve(read.result); db.close(); }; read.onerror = () => reject(read.error); }; }), table);
}

for (const mutation of ['delete-job', 'change-source'] as const) test(`公司分析等待期间${mutation === 'delete-job' ? '删除岗位后不写回孤立结果' : '修改来源后拒绝保存过期分析'}`, async ({ page }) => {
  let release!: () => void; let started!: () => void; const requested = new Promise<void>(resolve => { started = resolve; }); const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/assist', async route => { expect(route.request().postDataJSON().action).toBe('company'); started(); await pending; await route.fulfill({ json: company }); });
  await restore(page, { sources: [source], companies: [{ id: 'existing-company', jobId: job.id, inputVersion: inputVersion(job as any, [], [source]), createdAt: now, data: company }] });
  await page.getByRole('button', { name: job.title, exact: true }).click(); await page.getByRole('tab', { name: '公司与业务', exact: true }).click(); await page.locator('.company-research > .source-library > summary').click();
  const analyze = page.getByRole('button', { name: '分析已保存资料', exact: true }); await analyze.click(); await requested; await expect(analyze).toBeDisabled();
  await page.evaluate(({ mutation, jobId, source }) => new Promise<void>((resolve, reject) => {
    // Hold the current view as when another tab writes before this view refreshes.
    window.addEventListener('jdtool-workspace-updated', event => event.stopImmediatePropagation(), { capture: true });
    const open = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`); open.onerror = () => reject(open.error); open.onsuccess = () => { const db = open.result; const tx = db.transaction(['jobs', 'sources', 'companies'], 'readwrite');
      if (mutation === 'delete-job') { tx.objectStore('jobs').delete(jobId); tx.objectStore('sources').clear(); tx.objectStore('companies').clear(); }
      else tx.objectStore('sources').put({ ...source, text: '新的公司资料：业务范围已更新，原有分析需要重做。' });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), { mutation, jobId: job.id, source });
  release(); await expect(analyze).toBeEnabled(); expect(await records(page, 'companies')).toHaveLength(mutation === 'delete-job' ? 0 : 1); await expect(page.locator('.company-research').getByRole('alert')).toContainText('更新');
});

test('恢复旧表述时项目事实已更新，取消采用并要求重新核对', async ({ page }) => {
  await restore(page, { projects: [project], recommendations: [{ id: 'old-recommendation', jobId: job.id, inputVersion: 'old-version', createdAt: now, projectVersions: [{ id: project.id, updatedAt: '2026-10-20T08:00:00.000Z' }], data: { recommendations: [{ projectId: project.id, rank: 1, role: 'primary', matchType: 'direct', requirementIds: ['r1'], factIds: ['f1'], reason: '旧事实对应的表述', resumeBullets: [{ text: '访谈十位用户', factIds: ['f1'], adopted: true }], interviewOutline: [] }], gaps: [], needsReview: [] } }] });
  await page.getByRole('button', { name: job.title, exact: true }).click(); await page.getByRole('tab', { name: /准备项目/ }).click(); await expect(page.getByRole('checkbox', { name: '已核对，采用这条表述', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: '复制已采用的表述', exact: true }).click(); await expect(page.locator('.builder').getByRole('alert')).toContainText('请先核对');
});

test('旧岗位行动与已有已完成待办相同时，恢复关联并保留完成状态', async ({ page }) => {
  await restore(page, { jobs: [{ ...job, nextAction: '整理访谈记录' }], tasks: [{ id: 'finished-action', text: '整理访谈记录', jobIds: [job.id], done: true, order: 0, createdAt: now }] });
  await page.goto('/#home'); await page.reload(); await expect(page.getByRole('button', { name: '新手教程', exact: true })).toBeEnabled(); await expect(page.locator('.hub-task')).toHaveCount(0); await page.getByRole('combobox', { name: '待办状态', exact: true }).selectOption('done'); await expect(page.locator('.hub-task')).toHaveCount(1); expect((await records(page, 'tasks'))[0]).toMatchObject({ id: 'finished-action', done: true });
});

test('旧备份更换下一步行动时，补齐待办不能覆盖先前已完成记录', async ({ page }) => {
  await restore(page, { jobs: [{ ...job, nextAction: '原来的行动' }] }); await page.goto('/#home'); await page.reload(); await expect(page.getByRole('button', { name: '新手教程', exact: true })).toBeEnabled();
  await page.locator('.hub-task').getByRole('checkbox').click(); await expect.poll(async () => (await records(page, 'tasks'))[0]?.done).toBe(true); const originalId = (await records(page, 'tasks'))[0].id;
  await page.evaluate(job => new Promise<void>((resolve, reject) => { const open = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`); open.onsuccess = () => { const db = open.result; const tx = db.transaction('jobs', 'readwrite'); tx.objectStore('jobs').put({ ...job, nextAction: '新的行动' }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); }; open.onerror = () => reject(open.error); }), job);
  await page.reload(); await expect(page.getByRole('button', { name: '新手教程', exact: true })).toBeEnabled(); await expect(page.locator('.hub-task')).toHaveCount(1); await expect(page.locator('.hub-task')).toContainText('新的行动'); const saved = await records(page, 'tasks'); expect(saved).toHaveLength(2); expect(saved.find(row => row.id === originalId)).toMatchObject({ text: '原来的行动', done: true });
});

test('删除项目只清理关联岗位的衍生待办，保留其他岗位的同名事项', async ({ page }) => {
  const otherJob = { ...job, id: 'other-job', title: '交互设计师', requirements: [{ ...job.requirements[0], id: 'other-requirement' }] }; const otherProject = { ...project, id: 'other-project', name: '独立项目', facts: [{ ...project.facts[0], id: 'other-fact' }] }; const text = '补充验证记录';
  const preparations = [job, otherJob].map((row, index) => ({ id: 'prep-' + index, jobId: row.id, inputVersion: 'existing', createdAt: now, projectVersions: [{ id: index ? otherProject.id : project.id, updatedAt: now }], data: { priorities: [{ text, reason: '补充相应项目依据', requirementIds: [], factIds: [index ? 'other-fact' : 'f1'], sourceIds: [] }], strengths: [], gaps: [], companyResearch: [] } }));
  await restore(page, { jobs: [job, otherJob], projects: [project, otherProject], preparations, tasks: [{ id: 'affected-task', text, jobIds: [job.id], done: false, order: 0, createdAt: now }, { id: 'independent-task', text, jobIds: [otherJob.id], done: false, order: 1, createdAt: now }, { id: 'shared-task', text, jobIds: [job.id, otherJob.id], done: false, order: 2, createdAt: now }] });
  await page.getByRole('button', { name: '我的信息', exact: true }).click(); page.once('dialog', dialog => dialog.accept()); await page.locator('.project-grid article').filter({ has: page.getByRole('heading', { name: project.name, exact: true }) }).getByRole('button', { name: '删除项目', exact: true }).click(); await expect(page.getByRole('heading', { name: project.name, exact: true })).toHaveCount(0);
  const remaining = await records(page, 'tasks'); expect(remaining).toEqual([expect.objectContaining({ id: 'independent-task', jobIds: [otherJob.id] })]); expect(await records(page, 'preparations')).toHaveLength(1);
});

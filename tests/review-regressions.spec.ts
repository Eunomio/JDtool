import { expect, test, type Page } from './fixtures';
import { readFile } from 'node:fs/promises';

const now = '2026-10-20T08:00:00.000Z';
const job = { id: 'review-job', title: '后端工程师', company: '测试公司', content: '职责：设计可靠事务。要求：掌握数据库并发控制。', requirements: [{ id: 'review-r1', text: '掌握数据库并发控制', sourceText: '要求：掌握数据库并发控制。' }], responsibilities: [], direction: '后端开发', status: '关注中', nextAction: '', createdAt: now, updatedAt: now };
const project = { id: 'review-project', name: '海鸥内部项目', type: '工作项目', stage: '已测试', timeline: '', role: '开发', problem: '', actions: '', methods: '', results: '', skills: [], facts: [{ id: 'review-f1', text: '为海鸥内部项目实现事务处理', sourceText: '为海鸥内部项目实现事务处理', category: '本人补充' }], sources: [{ id: 'review-source', label: '海鸥内部项目说明', url: '', text: '为海鸥内部项目实现事务处理', collectedAt: now }], confirmed: true, visibility: 'private', redactions: [], updatedAt: now };
const backup = { format: 'jdtool-backup', version: 2, jobs: [job], projects: [project] };
const advice = { text: '为海鸥内部项目整理事务说明', reason: '复用海鸥内部项目的方法', requirementIds: ['review-r1'], factIds: ['review-f1'], sourceIds: [] };
const exercise = { id: 'review-exercise', direction: '后端开发', background: '模拟排查并发事务冲突。', question: '如何保证库存扣减的一致性？', dimensions: ['事务', '并发', '可靠性'], followupDirections: ['隔离级别'], nodes: [{ title: '排查并发冲突', situation: '订单出现并发写入冲突', colleague: '开发同事', choices: ['核对事务', '分析日志'], change: '请求量增加' }, { title: '验证修复方案', situation: '验证事务结果一致', colleague: '开发同事', choices: ['回放请求', '压力验证'], change: '时间有限' }] };
const feedback = { strengths: ['能说明事务边界'], dimensions: [], improvements: [], outline: ['说明隔离级别'], nextActions: [] };

async function importBackup(page: Page, data: unknown = backup) {
  await page.route('**/api/company/research', (route) => route.fulfill({ status: 503, json: { error: { code: 'SEARCH_UNAVAILABLE', message: '公司搜索暂时不可用，可以先准备项目。' } } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible();
  await page.getByText('资料备份', { exact: true }).click();
}

async function openJob(page: Page) {
  await page.getByRole('button', { name: '岗位清单', exact: true }).click();
  await page.getByRole('button', { name: job.title, exact: true }).click();
  await page.getByRole('tab', { name: /准备项目/ }).click();
}

async function assemble(page: Page) {
  await openJob(page);
  await page.getByRole('checkbox', { name: project.name, exact: true }).check();
  await page.getByRole('button', { name: '用所选原始事实手动组装' }).click();
  await expect(page.getByLabel('简历要点1', { exact: true })).toHaveValue(project.facts[0].text);
  await page.getByRole('checkbox', { name: '已核对，采用这条表述' }).check();
  await expect(page.getByText('表述已保存。', { exact: true })).toBeVisible();
}

async function stored(page: Page, table: string) {
  return page.evaluate((table) => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const open = indexedDB.open('jdtool'); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const database = open.result; const get = database.transaction(table).objectStore(table).getAll(); get.onerror = () => reject(get.error); get.onsuccess = () => { resolve(get.result); database.close(); }; };
  }), table);
}

test('修改脱敏规则后旧文案和理由同步替换，重新核对后才能复制', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => { (window as unknown as { copied: string }).copied = value; } } }); });
  await importBackup(page); await assemble(page);
  await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await page.getByRole('button', { name: '编辑与核对' }).click();
  await page.getByRole('radio', { name: '生成可展示版本', exact: true }).check();
  await page.getByLabel('替换规则', { exact: true }).fill('海鸥内部项目 => 某内部产品');
  await page.getByRole('button', { name: '保存项目事实', exact: true }).click();
  await expect(page.getByRole('heading', { name: '某内部产品', exact: true })).toBeVisible();
  await openJob(page);
  await expect(page.getByLabel('简历要点1', { exact: true })).toHaveValue('为某内部产品实现事务处理');
  const adopted = page.getByRole('checkbox', { name: '已核对，采用这条表述' });
  await expect(adopted).not.toBeChecked();
  await page.getByRole('button', { name: '复制已采用的表述' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('请先核对当前项目事实');
  await adopted.check(); await expect(page.getByText('表述已保存。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '复制已采用的表述' }).click();
  await expect(page.getByText('已复制采用的表述。', { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toBe('某内部产品\n为某内部产品实现事务处理');
});

test('清除项目时清除生成文案及关联计划，保留岗位并可完整备份恢复', async ({ page, browser }) => {
  await page.route('**/api/assist', (route) => route.fulfill({ json: { priorities: [advice], strengths: [advice], gaps: [], companyResearch: [] } }));
  await importBackup(page); await assemble(page);
  await page.getByRole('tab', { name: /面试准备/ }).click();
  await page.getByRole('button', { name: '生成岗位准备卡', exact: true }).click();
  await page.getByRole('button', { name: '加入我的计划', exact: true }).first().click();
  await expect(page.getByText('已加入本周准备。', { exact: true })).toBeVisible();
  await page.getByText('资料备份', { exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份' }).click();
  const file = await downloading; const fullBackup = JSON.parse((await readFile((await file.path())!)).toString());
  await page.getByText('资料备份', { exact: true }).click();
  const context = await browser.newContext();
  try {
    const other = await context.newPage(); await importBackup(other, fullBackup); await openJob(other);
    await other.getByRole('tab', { name: /面试准备/ }).click();
    await expect(other.getByRole('heading', { name: '岗位准备卡', exact: true })).toBeVisible();
    await other.getByRole('tab', { name: /准备项目/ }).click();
    await expect(other.getByLabel('简历要点1', { exact: true })).toHaveValue(project.facts[0].text);
    await expect(other.getByRole('checkbox', { name: '已核对，采用这条表述' })).toBeChecked();
  } finally { await context.close(); }
  await page.getByRole('button', { name: '我的项目', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '清除简历与项目资料', exact: true }).click();
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toHaveCount(0);
  for (const table of ['projects', 'recommendations', 'preparations', 'comparisons', 'tasks']) expect(await stored(page, table)).toHaveLength(0);
  expect(await stored(page, 'jobs')).toHaveLength(1);
  await openJob(page); await expect(page.getByRole('button', { name: '复制已采用的表述' })).toHaveCount(0);
});

test('删除单个项目保留其他项目，复制前重新检查记录是否还存在', async ({ page }) => {
  const other = { ...project, id: 'other-project', name: '另一个真实项目', facts: [{ ...project.facts[0], id: 'other-f1' }] };
  await importBackup(page, { ...backup, projects: [project, other] }); await assemble(page);
  // Simulate deletion in another tab while this page still shows the adopted version.
  await page.evaluate(() => new Promise<void>((resolve) => { const open = indexedDB.open('jdtool'); open.onsuccess = () => { const db = open.result; const transaction = db.transaction('projects', 'readwrite'); transaction.objectStore('projects').delete('review-project'); transaction.oncomplete = () => { db.close(); resolve(); }; }; }));
  await page.getByRole('button', { name: '复制已采用的表述' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('请先核对当前项目事实');
  await page.reload(); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: other.name, exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: '删除项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: other.name, exact: true })).toHaveCount(0);
  expect(await stored(page, 'recommendations')).toHaveLength(0);
  expect(await stored(page, 'jobs')).toHaveLength(1);
});

test('损坏、嵌套格式异常和关联缺失的备份都不能覆盖现有资料', async ({ page }) => {
  await importBackup(page);
  const broken = [
    { ...backup, jobs: [{ ...job, title: { bad: 'object' } }] },
    { ...backup, projects: [{ ...project, facts: 'broken' }] },
    { ...backup, tasks: [{ id: 'bad-task', jobIds: 'broken' }] },
    { ...backup, jobs: [job, job] },
    { ...backup, jobs: [{ ...job, title: '不能写入的标题' }], tasks: [{ id: 'bad-link', text: '任务', jobIds: ['missing-job'], done: false, order: 0, createdAt: now }] },
  ];
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  for (const data of broken) {
    await page.getByText('资料备份', { exact: true }).click();
    await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect(page.getByRole('status')).toContainText('现有资料未被修改');
    await page.getByText('资料备份', { exact: true }).click();
    expect((await stored(page, 'jobs'))[0].title).toBe(job.title);
  }
  await page.reload(); await expect(page.getByRole('button', { name: job.title, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('删除未使用的项目保留其他项目的独立文案', async ({ page }) => {
  const other = { ...project, id: 'unused-project', name: '尚未使用的项目', facts: [{ ...project.facts[0], id: 'unused-f1' }] };
  await importBackup(page, { ...backup, projects: [project, other] }); await assemble(page);
  await page.getByRole('button', { name: '我的项目', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('article').filter({ has: page.getByRole('heading', { name: other.name, exact: true }) }).getByRole('button', { name: '删除项目', exact: true }).click();
  await expect(page.getByRole('heading', { name: other.name, exact: true })).toHaveCount(0);
  expect(await stored(page, 'recommendations')).toHaveLength(1);
  await openJob(page); await expect(page.getByLabel('简历要点1', { exact: true })).toHaveValue(project.facts[0].text);
});

test('另一个标签页清除项目后，撤销岗位删除不会恢复已清除的文案', async ({ page, context }) => {
  await page.route('**/api/assist', (route) => route.fulfill({ json: { priorities: [advice], strengths: [], gaps: [], companyResearch: [] } }));
  await importBackup(page); await assemble(page);
  await page.getByRole('tab', { name: /面试准备/ }).click();
  await page.getByRole('button', { name: '生成岗位准备卡', exact: true }).click();
  await page.getByRole('button', { name: '加入我的计划', exact: true }).click();
  await expect(page.getByText('已加入本周准备。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回岗位清单', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible();
  const other = await context.newPage();
  try {
    await other.goto('/'); await other.getByRole('button', { name: '我的项目', exact: true }).click();
    await expect(other.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
    other.once('dialog', (dialog) => dialog.accept()); await other.getByRole('button', { name: '清除简历与项目资料', exact: true }).click();
    await expect(other.getByRole('heading', { name: project.name, exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.getByRole('button', { name: job.title, exact: true })).toBeVisible();
    for (const table of ['projects', 'recommendations', 'preparations', 'tasks']) expect(await stored(page, table)).toHaveLength(0);
  } finally { await other.close(); }
});

test('旧版只有岗位的备份仍可恢复', async ({ page }) => {
  await importBackup(page, { format: 'jdtool-backup', version: 1, jobs: [job] });
  await expect(page.getByRole('button', { name: job.title, exact: true })).toBeVisible();
});

test('备份中的表述缺少原始事实时取消采用并阻止复制', async ({ page }) => {
  await importBackup(page, { ...backup, recommendations: [{ id: 'old-rec', jobId: job.id, inputVersion: 'old', createdAt: now, data: { recommendations: [{ projectId: project.id, rank: 1, role: 'primary', matchType: 'direct', requirementIds: ['review-r1'], factIds: ['missing-fact'], reason: '旧项目表述', resumeBullets: [{ text: '无法核对的旧表述', factIds: ['missing-fact'], adopted: true }], interviewOutline: [] }], gaps: [], needsReview: [] } }] });
  await openJob(page);
  const adopted = page.getByRole('checkbox', { name: '已核对，采用这条表述' });
  await expect(adopted).not.toBeChecked(); await expect(adopted).toBeDisabled();
  await page.getByRole('button', { name: '复制已采用的表述' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('请先核对当前项目事实');
});

test('重启练习保留JD题目，JD更新后重新生成对应题目，并保留实际追问', async ({ page }) => {
  let exercises = 0;
  await page.route('**/api/assist', async (route) => {
    const input = route.request().postDataJSON();
    if (input.action === 'exercise') { exercises++; await route.fulfill({ json: { ...exercise, question: input.job.content.includes('消息队列') ? '如何保证消息队列的可靠投递？' : exercise.question } }); }
    else if (input.stage === 'followup') await route.fulfill({ json: { followup: '请解释序列化隔离级别。', feedback: null } });
    else { expect(input.followup).toBe('请解释序列化隔离级别。'); expect(input.supplement).toBe('避免并发事务出现不一致。'); await route.fulfill({ json: { followup: '', feedback } }); }
  });
  await importBackup(page); await page.getByRole('button', { name: '模拟面试', exact: true }).click();
  await expect(page.getByText(exercise.question, { exact: true })).toBeVisible();
  const restart = page.getByRole('button', { name: '重新开始', exact: true }); await expect(restart).toBeEnabled();
  page.once('dialog', (dialog) => dialog.accept()); await restart.click();
  await expect(page.getByText(exercise.question, { exact: true })).toBeVisible(); expect(exercises).toBe(1);
  await page.getByLabel('我的回答', { exact: true }).fill('先确定事务边界。'); await page.getByRole('button', { name: '提交回答，获得追问' }).click();
  await expect(page.getByText('请解释序列化隔离级别。', { exact: true })).toBeVisible();
  await page.getByLabel('补充回答', { exact: true }).fill('避免并发事务出现不一致。'); await page.getByRole('button', { name: '提交补充，查看复盘' }).click();
  await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible();
  await openJob(page); await page.getByRole('button', { name: '编辑JD', exact: true }).click();
  await page.getByRole('textbox', { name: '岗位原文', exact: true }).fill('职责：设计消息队列的可靠投递机制。要求：掌握队列事务。');
  await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  await page.getByRole('button', { name: '模拟面试', exact: true }).last().click();
  await expect(page.getByText('岗位或公司资料已更新，这份记录来自更新前的练习，可重新开始。', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('button', { name: '重新开始', exact: true }).click();
  await expect(page.getByText('如何保证消息队列的可靠投递？', { exact: true })).toBeVisible(); expect(exercises).toBe(2);
});

test('题目生成失败时保留目标岗位并提供重试，不展示无关通用题', async ({ page }) => {
  await page.route('**/api/assist', (route) => route.fulfill({ status: 503, json: { error: { message: '暂时无法准备题目，请重试。' } } }));
  await importBackup(page); await page.getByRole('button', { name: '模拟面试', exact: true }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('暂时无法准备题目');
  await expect(page.getByText(/使用率下降和两类新需求/)).toHaveCount(0);
  await page.route('**/api/assist', (route) => route.fulfill({ json: exercise }));
  await page.getByRole('button', { name: '重新准备题目', exact: true }).click();
  await expect(page.getByText(exercise.question, { exact: true })).toBeVisible();
});

test('任务写入被阻塞时立即刷新，暂存操作仍能恢复', async ({ page, context }) => {
  await importBackup(page, { ...backup, tasks: [{ id: 'review-task', text: '检查事务', jobIds: [job.id], done: false, order: 0, createdAt: now }] });
  const locker = await context.newPage(); await locker.goto('/api/health');
  await locker.evaluate(() => new Promise<void>((resolve) => {
    const open = indexedDB.open('jdtool');
    open.onsuccess = () => { const db = open.result; const transaction = db.transaction('tasks', 'readwrite'); const store = transaction.objectStore('tasks'); let first = true;
      const hold = () => { const read = store.get('review-task'); read.onsuccess = () => { if (first) { first = false; resolve(); } if (!(window as unknown as { release: boolean }).release) hold(); }; }; hold(); transaction.oncomplete = () => db.close();
    };
  }));
  try {
    const checkbox = page.getByRole('checkbox', { name: /检查事务/ }); await checkbox.check();
    await expect(checkbox).toBeDisabled();
    expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('jdtool-task-change:')))).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
  } finally { await locker.evaluate(() => { (window as unknown as { release: boolean }).release = true; }); }
  await expect(page.getByRole('checkbox', { name: /检查事务/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /检查事务/ })).toBeEnabled();
  expect((await stored(page, 'tasks'))[0].done).toBe(true);
  await locker.close();
});

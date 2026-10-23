import { expect, test } from './fixtures';

test('保存、刷新、修改状态、编辑与删除撤销', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新增JD', exact: true }).click();
  await page.getByRole('tab', { name: '粘贴正文' }).click();
  await page.getByLabel('岗位正文', { exact: true }).fill('分析用户需求，协同技术与运营推进产品改进。');
  await page.getByRole('button', { name: '手动整理为草稿' }).click();
  await page.getByLabel('岗位名称').fill('产品经理');
  await page.getByLabel('公司名称').fill('测试公司');
  await page.getByRole('button', { name: '保存岗位' }).click();
  await expect(page.getByRole('heading', { name: '产品经理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回岗位清单', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '产品经理', exact: true })).toBeVisible();
  await page.getByLabel('产品经理投递状态').selectOption('面试中');
  const nextAction = page.getByLabel('下一步行动');
  await nextAction.fill('准备需求分析项目');
  await nextAction.press('Tab');
  await expect(nextAction).toHaveValue('准备需求分析项目');
  // Wait for the IndexedDB update and the resulting list refresh before navigating.
  await expect(page.getByLabel('产品经理投递状态')).toHaveValue('面试中');
  await page.waitForFunction(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`jdtool-${localStorage.getItem('jdtool-active-account')}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<boolean>((resolve) => {
        const request = db.transaction('jobs').objectStore('jobs').getAll();
        request.onsuccess = () => resolve(request.result.some((job) => job.nextAction === '准备需求分析项目'));
      });
    } finally { db.close(); }
  });
  await page.reload();
  await expect(page.getByLabel('产品经理投递状态')).toHaveValue('面试中');
  await expect(page.getByLabel('下一步行动')).toHaveValue('准备需求分析项目');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('岗位名称').fill('AI产品经理');
  await page.getByRole('button', { name: '保存岗位' }).click();
  await expect(page.getByRole('heading', { name: 'AI产品经理', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回岗位清单', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI产品经理', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByRole('button', { name: 'AI产品经理', exact: true })).toBeVisible();
});

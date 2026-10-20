import { expect, test } from './fixtures';
import { readFile } from 'node:fs/promises';

test('导出资料后可在独立浏览器恢复岗位', async ({ page, browser }) => {
  await page.goto('/'); await page.getByRole('button', { name: '体验6个示例岗位' }).click();
  await expect(page.getByRole('button', { name: '人因研究工程师', exact: true })).toBeVisible();
  await page.getByText('资料备份', { exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份' }).click();
  const download = await downloading; const data = await readFile((await download.path())!);
  expect(JSON.parse(data.toString()).jobs).toHaveLength(6);
  const other = await browser.newContext();
  try {
    const restored = await other.newPage(); await restored.goto('http://127.0.0.1:7860');
    await restored.getByText('资料备份', { exact: true }).click();
    restored.once('dialog', (dialog) => dialog.accept());
    await restored.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: data });
    await expect(restored.getByRole('button', { name: '人因研究工程师', exact: true })).toBeVisible();
    await restored.reload(); await expect(restored.getByRole('button', { name: '人因研究工程师', exact: true })).toBeVisible();
  } finally { await other.close(); }
});

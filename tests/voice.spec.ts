import { test, expect } from './fixtures';

test('语音识别不可用或麦克风被拒绝时说明原因，取消保留原文且不提交表单', async ({ page }) => {
  await page.route('**/api/voice/transcribe', route => route.fulfill({ json: { available: false } }));
  await page.goto('/'); await page.getByRole('button', { name: '新增JD', exact: true }).click(); await page.getByRole('tab', { name: '粘贴正文', exact: true }).click();
  const field = page.getByRole('textbox', { name: '岗位正文', exact: true }); await field.fill('已有的岗位内容'); await page.getByRole('button', { name: '语音输入：岗位正文', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByRole('button', { name: '开始录音', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('暂时不可用'); await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(field).toHaveValue('已有的岗位内容');
  await page.route('**/api/voice/transcribe', route => route.fulfill({ json: { available: true } }));
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: '语音输入：岗位正文', exact: true }).click(); await dialog.getByRole('button', { name: '开始录音', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('请允许浏览器使用麦克风'); await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(field).toHaveValue('已有的岗位内容');
});

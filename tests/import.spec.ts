import { expect, test } from '@playwright/test';

const text = '示例科技\n人因研究工程师\n工作地点：深圳\n岗位职责：设计用户研究实验。\n任职要求：掌握统计分析方法。';
const job = { isJobPosting: true, rawText: text, title: '人因研究工程师', company: '示例科技', location: '深圳', direction: '人因研究', hiringType: '实习', responsibilities: [{ text: '设计用户研究实验', sourceText: '岗位职责：设计用户研究实验。' }], requirements: [{ text: '掌握统计分析方法', sourceText: '任职要求：掌握统计分析方法。' }], warnings: [] };

test('岗位链接直接解析并核对保存', async ({ page }) => {
  await page.route('**/api/jobs/parse', async (route) => {
    const input = route.request().postDataJSON();
    expect(input.type).toBe('link'); expect(input.url).toBe('https://example.com/jobs/123');
    await route.fulfill({ json: { job, sourceUrl: input.url, sourceType: 'link', parsedAt: new Date().toISOString() } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '新增JD', exact: true }).click();
  await page.getByLabel('招聘页面链接').fill('https://example.com/jobs/123');
  await page.getByRole('button', { name: '读取并解析', exact: true }).click();
  await expect(page.getByLabel('岗位名称')).toHaveValue('人因研究工程师');
  await expect(page.getByLabel('地点', { exact: true })).toHaveValue('深圳');
  await page.getByLabel('岗位名称').fill('人因研究工程师实习');
  await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  await expect(page.getByRole('heading', { name: '人因研究工程师实习', exact: true })).toBeVisible();
});

test('多张截图识别、顺序调整和校对', async ({ page }) => {
  await page.route('**/api/jobs/parse', async (route) => {
    const input = route.request().postDataJSON(); expect(input.type).toBe('images'); expect(input.images).toHaveLength(2);
    expect(input.images[0].name).toBe('second.png');
    await route.fulfill({ json: { job, sourceUrl: '', sourceType: 'images', parsedAt: new Date().toISOString() } });
  });
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled(); const image = await page.screenshot();
  await page.getByRole('button', { name: '新增JD', exact: true }).click();
  await page.getByRole('tab', { name: 'JD截图', exact: true }).click();
  await page.getByLabel('选择JD截图', { exact: true }).setInputFiles([{ name: 'first.png', mimeType: 'image/png', buffer: image }, { name: 'second.png', mimeType: 'image/png', buffer: image }]);
  await expect(page.getByAltText('JD截图2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '前移', exact: true }).nth(1).click();
  await page.getByRole('button', { name: '识别并解析截图' }).click();
  await expect(page.getByAltText('原始JD截图1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('岗位名称')).toHaveValue(job.title);
  await page.getByRole('button', { name: '保存岗位', exact: true }).click();
  await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible();
});

test('链接失败后保留链接并继续使用正文', async ({ page }) => {
  await page.route('**/api/jobs/parse', (route) => route.fulfill({ status: 422, json: { error: { code: 'SOURCE_UNAVAILABLE', message: '网页需要登录，请上传截图或粘贴正文。' } } }));
  await page.goto('/'); await page.getByRole('button', { name: '新增JD', exact: true }).click();
  await page.getByLabel('招聘页面链接').fill('https://example.com/login');
  await page.getByRole('button', { name: '读取并解析' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '网页需要登录' })).toBeVisible();
  await page.getByRole('button', { name: '粘贴正文', exact: true }).click();
  await page.getByLabel('岗位正文').fill(text);
  await page.getByRole('button', { name: '手动整理为草稿' }).click();
  await expect(page.getByLabel('来源链接')).toHaveValue('https://example.com/login');
});

test('拒绝内网链接与伪装成截图的文件', async ({ request }) => {
  const internal = await request.post('/api/jobs/parse', { data: { type: 'link', url: 'http://127.0.0.1:7860/api/health' } });
  expect(internal.status()).toBe(400);
  const invalidImage = await request.post('/api/jobs/parse', { data: { type: 'images', images: [{ name: 'fake.png', dataUrl: 'data:image/png;base64,' + Buffer.from('This is not an image.'.repeat(4)).toString('base64') }] } });
  expect(invalidImage.status()).toBe(400);
});

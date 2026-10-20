import { expect, test } from './fixtures';
import JSZip from 'jszip';

test('DOCX简历读取后可核对原文', async ({ page }) => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>需求研究项目：本人开展用户访谈并整理需求清单，产出软件原型。</w:t></w:r></w:p></w:body></w:document>');
  await page.goto('/'); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await page.getByLabel('上传简历').setInputFiles({ name: 'resume.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await expect(page.getByLabel('简历或项目文字')).toHaveValue(/本人开展用户访谈并整理需求清单/);
});

test('文字PDF简历可读取', async ({ page, context }) => {
  const fixture = await context.newPage();
  await fixture.setContent('<html><body style="padding:40px;font:20px sans-serif">Product research project. Conducted user interviews, organized requirements, and created a software prototype.</body></html>');
  const document = await fixture.pdf(); await fixture.close();
  await page.goto('/'); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await page.getByLabel('上传简历').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: document });
  await expect(page.getByLabel('简历或项目文字')).toHaveValue(/Product research project/);
});

test('扫描PDF走文字识别并显示待核对文字', async ({ page, context }) => {
  const fixture = await context.newPage();
  await fixture.setContent('<html><body style="padding:40px;font:20px sans-serif">Scanned resume page</body></html>');
  const image = await fixture.screenshot();
  await fixture.setContent(`<html><body><img src="data:image/png;base64,${image.toString('base64')}" /></body></html>`);
  const document = await fixture.pdf(); await fixture.close();
  await page.route('**/api/documents/read', (route) => route.fulfill({ json: { text: '扫描简历识别：本人设计实验并分析眼动数据。' } }));
  await page.goto('/'); await page.getByRole('button', { name: '我的项目', exact: true }).click();
  await page.getByLabel('上传简历').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: document });
  await expect(page.getByLabel('简历或项目文字')).toHaveValue(/扫描简历识别/);
});

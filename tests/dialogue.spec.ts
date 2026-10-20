import { expect, test } from './fixtures';

const now = new Date().toISOString();
const job = { id: 'dialogue-job', title: '产品经理', company: '示例公司', content: '负责产品需求分析、用户反馈整理和需求优先级评估。', status: '关注中', nextAction: '', createdAt: now, updatedAt: now };
const message = '刚整理完上周的用户访谈记录，关于后排舒适性的吐槽集中在两点：一是座椅滑轨噪音大，二是氛围灯颜色太单调。目前BOM预算卡得很死，只能选一个方向先做优化。你能帮忙把这两类反馈做个优先级排序吗？需要给出理由，下午评审要用。';
const reply = '目前只有访谈记录，反馈人数和复现条件需要向研究同事核对。';
const exercise = { id: 'dialogue-exercise', direction: '产品经理', background: '练习任务：整理后排舒适性反馈，确定本轮改进优先级。', question: '你如何确定需求优先级？', dimensions: ['需求分析', '协作', '优先级'], followupDirections: ['证据'], nodes: [{ title: '整理反馈并排序', colleague: '产品经理', situation: `产品经理发来消息：“${message}”`, choices: ['先核对反馈覆盖人数和影响程度', '先整理复现条件和改进成本'], change: '交付要求：给出优先级及理由。' }, { title: '整理验证计划', colleague: '技术负责人', situation: '请说明改动范围和验证指标。', choices: ['安排小范围验证', '明确验收指标'], change: '资源限制：本轮只做一项改动。' }] };

test('岗位体验的角色与发消息说明在气泡外，首条及后续消息只显示实际对话，刷新兼容历史记录', async ({ page }) => {
  await page.route('**/api/assist', async route => {
    const input = route.request().postDataJSON();
    await route.fulfill({ json: input.action === 'exercise' ? exercise : { dialogue: `产品经理回复道：“${reply}”`, consequence: '', feedback: null } });
  });
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled();
  await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('选择备份文件').setInputFiles({ name: 'dialogue.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs: [job] })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
  await page.getByRole('button', { name: '岗位体验', exact: true }).click();
  const first = page.locator('.colleague-message').first();
  await expect(first.locator('.colleague-bubble')).toHaveText(message);
  await expect(first.locator('.colleague-meta strong')).toHaveText('产品经理');
  await expect(first.locator('.colleague-meta > span')).toHaveText('发来消息');
  await expect(first.locator('.colleague-bubble .colleague-meta')).toHaveCount(0);
  await expect(page.locator('.task-deliverable')).toHaveText('交付要求：给出优先级及理由。');
  await page.getByText('信息还不够？向产品经理提问', { exact: true }).click();
  await page.getByLabel('向产品经理提问', { exact: true }).fill('两类问题各影响多少用户？');
  await page.getByRole('button', { name: '发送问题', exact: false }).click();
  await expect(page.locator('.work-exchange .colleague-bubble')).toHaveText(reply);
  await expect(page.locator('.work-exchange .colleague-meta > span')).toHaveText('回复道');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.reload(); await page.getByRole('button', { name: '岗位体验', exact: true }).click();
  await expect(page.locator('.colleague-bubble').first()).toHaveText(message);
  await expect(page.locator('.work-exchange .colleague-bubble')).toHaveText(reply);
});

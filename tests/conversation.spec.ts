import { test, expect, navigate, type Page } from './fixtures';

const now = '2026-10-23T08:00:00.000Z';
const job = { id: 'chat-job', title: '产品经理', company: '构造团队', content: '分析用户需求，与设计和研发协作验证方案。', requirements: [{ id: 'r1', text: '分析用户需求', sourceText: '分析用户需求' }], responsibilities: [], status: '关注中', nextAction: '', createdAt: now, updatedAt: now };
const exercise = { id: 'chat-exercise', direction: '产品经理', background: '练习任务：整理一款工具的使用反馈，确定本轮改动方向。', question: '你会如何核对用户问题并确定优先级？', dimensions: ['分析', '协作', '验证'], followupDirections: ['证据'], nodes: [{ title: '确定问题范围', situation: '请整理需要核对的问题和本轮处理方向。', colleague: 'Mentor', choices: ['先核对用户反馈，再讨论改动范围', '先确认使用数据和现有资源'], change: '交付要求：给出处理方向及依据。' }, { title: '制定验证计划', situation: '请沿用刚才的处理方向，说明验证方法和所需协作。', colleague: '技术同事', choices: ['先小范围验证', '先核对指标口径'], change: '交付要求：明确验证方式和协作事项。' }] };
const feedback = { strengths: ['能先核对问题'], dimensions: [], improvements: ['补充验证周期'], outline: ['先核对证据，再确定方案'], nextActions: ['补齐一个验证案例'] };
async function seed(page: Page) {
  await page.goto('/'); await expect(page.getByRole('button', { name: '体验6个示例岗位' })).toBeEnabled(); await page.getByText('资料备份', { exact: true }).click(); page.once('dialog', dialog => dialog.accept());
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'chat.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'jdtool-backup', version: 2, jobs: [job] })) });
  await expect(page.getByText('备份已恢复。', { exact: true })).toBeVisible(); await page.getByText('资料备份', { exact: true }).click();
}
async function contact(page: Page, name: string) {
  const toggle = page.getByRole('button', { name: '会话', exact: true }); if (await toggle.isVisible()) await toggle.click();
  await page.locator('.office-contact').filter({ has: page.getByText(name, { exact: true }) }).click();
}

test('面试通过左右消息推进，失败消息刷新后可修改重发，复盘和对话分别查看', async ({ page }) => {
  let followups = 0;
  await page.route('**/api/assist', async route => { const input = route.request().postDataJSON(); if (input.action === 'exercise') return route.fulfill({ json: { ...exercise, nodes: [] } }); if (input.stage === 'followup' && ++followups === 1) return route.fulfill({ status: 503, json: { error: { message: '暂时未收到回复。' } } }); return route.fulfill({ json: { followup: input.stage === 'followup' ? '你会怎样确认反馈具有代表性？' : '', feedback: input.stage === 'review' ? feedback : null } }); });
  await seed(page); await navigate(page, '模拟面试'); await expect(page.locator('.chat-question .chat-speaker')).toHaveText('面试官'); await expect(page.locator('.chat-question .chat-bubble')).toHaveText(exercise.question); await expect(page.locator('.conversation-context')).not.toContainText(exercise.question); await page.getByRole('textbox', { name: '我的回答', exact: true }).fill('先核对反馈来源。'); await page.getByRole('button', { name: '提交回答，获得追问', exact: true }).click();
  await expect(page.locator('.chat-own .chat-bubble')).toHaveText('先核对反馈来源。'); await expect(page.locator('main').getByRole('alert')).toContainText('暂时未收到回复');
  await page.reload(); await expect(page.getByRole('button', { name: '重试回复', exact: true })).toBeVisible(); expect(followups).toBe(1);
  await page.getByRole('button', { name: '修改消息', exact: true }).click(); const field = page.getByRole('textbox', { name: '我的回答', exact: true }); await expect(field).toHaveValue('先核对反馈来源。'); await field.fill('先核对反馈来源和覆盖范围。'); await field.press('Control+Enter');
  await expect(page.locator('.chat-other .chat-bubble').last()).toContainText('你会怎样确认反馈具有代表性');
  const own = await page.locator('.chat-own .chat-bubble').boundingBox(); const other = await page.locator('.chat-other .chat-bubble').last().boundingBox(); expect(own!.x + own!.width).toBeGreaterThan(other!.x + other!.width);
  await page.getByRole('textbox', { name: '补充回答', exact: true }).fill('对照用户分群，并补充观察样本。'); await page.getByRole('button', { name: '提交补充，查看复盘', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看本轮复盘', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '查看本轮复盘', exact: true }).click(); await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible(); await page.getByRole('button', { name: '返回对话', exact: true }).click(); await expect(page.locator('.chat-own')).toHaveCount(2);
});

test('工作私聊按任务推进，参考思路只填入草稿，会话切换保留前序消息和方案上下文', async ({ page }) => {
  const calls: Record<string, any>[] = []; let failPlan = true;
  await page.route('**/api/assist', async route => { const input = route.request().postDataJSON(); calls.push(input); if (input.stage === 'decision' && JSON.parse(input.context).currentNode === 0 && failPlan) { failPlan = false; return route.fulfill({ status: 503, json: { error: { message: '回复暂未完成' } } }); } await route.fulfill({ json: input.action === 'exercise' ? exercise : input.stage === 'review' ? { feedback, dialogue: '', consequence: '' } : { dialogue: '可以按这个方向核对，具体安排还需确认。', consequence: input.stage === 'decision' ? '先核对证据有助于明确方案范围。' : '', feedback: null } }); });
  await seed(page); await navigate(page, '岗位体验'); await expect(page.getByText(exercise.nodes[1].situation, { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: '向Mentor提问', exact: true }).fill('已有反馈来自哪些用户？'); await page.getByRole('button', { name: '发送问题', exact: true }).click(); await expect(page.locator('.work-exchange')).toHaveCount(1);
  await page.getByText('参考处理思路', { exact: true }).click(); await page.getByRole('button', { name: exercise.nodes[0].choices[0], exact: true }).click(); await expect(page.getByRole('textbox', { name: '我的方案', exact: true })).toHaveValue(exercise.nodes[0].choices[0]); expect(calls).toHaveLength(2);
  await page.getByRole('button', { name: '提交方案', exact: true }).click(); await expect(page.locator('main').getByRole('alert')).toContainText('回复暂未完成'); await page.reload(); await page.getByRole('button', { name: '修改消息', exact: true }).click(); await expect(page.getByRole('textbox', { name: '我的方案', exact: true })).toHaveValue(exercise.nodes[0].choices[0]); await page.getByRole('button', { name: '提交方案', exact: true }).click(); await page.getByRole('button', { name: '继续下一项任务', exact: true }).click(); await expect(page.getByText(exercise.nodes[1].situation, { exact: true })).toBeVisible();
  await contact(page, 'Mentor'); await expect(page.locator('.chat-own').filter({ hasText: exercise.nodes[0].choices[0] })).toBeVisible(); await expect(page.getByRole('textbox', { name: '我的方案', exact: true })).toHaveCount(0); await page.getByRole('button', { name: '回到当前会话', exact: true }).click();
  await page.getByRole('tab', { name: '提交方案', exact: true }).click(); await page.getByRole('textbox', { name: '我的方案', exact: true }).fill('沿用反馈核对方向，按用户分群安排小范围验证。'); await page.getByRole('button', { name: '提交方案', exact: true }).click();
  await expect(page.getByRole('button', { name: '查看任务复盘', exact: true })).toBeVisible(); const context = JSON.parse(calls.at(-1)!.context); expect(context.currentNode).toBe(1); expect(context.history.some((move: { action: string }) => move.action === exercise.nodes[0].choices[0])).toBe(true);
  await page.getByRole('button', { name: '查看任务复盘', exact: true }).click(); await expect(page.getByRole('heading', { name: '本次复盘', exact: true })).toBeVisible(); await page.getByRole('button', { name: '返回对话', exact: true }).click(); await contact(page, 'Mentor'); await expect(page.locator('.chat-own').filter({ hasText: exercise.nodes[0].choices[0] })).toBeVisible();
});

test('聊天输入区随窗口大小保持可操作，资料单独打开，临时草稿立即刷新也可恢复', async ({ page }) => {
  await page.route('**/api/assist', route => route.fulfill({ json: { ...exercise, nodes: [] } })); await seed(page); await navigate(page, '模拟面试');
  const field = page.getByRole('textbox', { name: '我的回答', exact: true }); await field.fill('未发送也需要保留的草稿'); await page.reload(); await expect(field).toHaveValue('未发送也需要保留的草稿');
  for (const [width, height] of [[1440, 900], [1024, 640], [390, 844], [320, 740], [844, 390]]) {
    await page.setViewportSize({ width, height }); await expect.poll(() => page.locator('.chat-composer').evaluate(node => { const box = node.getBoundingClientRect(); const screen = node.closest('.conversation-app')!.getBoundingClientRect(); return box.bottom <= screen.bottom + 1 && box.width > 200 && box.height > 50 && document.documentElement.scrollWidth <= innerWidth; })).toBe(true);
  }
  await page.getByRole('button', { name: '查看岗位资料', exact: true }).click(); await expect(page.getByRole('dialog', { name: '岗位与工作资料', exact: true })).toBeVisible(); await page.getByRole('button', { name: '关闭资料', exact: true }).click(); await expect(field).toHaveValue('未发送也需要保留的草稿');
});

test('语音输入在聊天输入区内核对并填入，取消保留原回答', async ({ page }) => {
  await page.route('**/api/assist', route => route.fulfill({ json: { ...exercise, nodes: [] } })); await seed(page); await navigate(page, '模拟面试');
  const field = page.getByRole('textbox', { name: '我的回答', exact: true }); await field.fill('已有回答'); await page.getByRole('button', { name: '语音输入：我的回答', exact: true }).click(); const recorder = page.getByRole('region', { name: '语音输入', exact: true }); await expect(recorder).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await recorder.getByRole('textbox', { name: '识别文字', exact: true }).fill('补充的回答'); await recorder.getByRole('button', { name: '填入文字', exact: true }).click(); await expect(field).toHaveValue('已有回答补充的回答');
  await page.getByRole('button', { name: '语音输入：我的回答', exact: true }).click(); await recorder.getByRole('textbox', { name: '识别文字', exact: true }).fill('不保留这段'); await recorder.getByRole('button', { name: '取消', exact: true }).click(); await expect(field).toHaveValue('已有回答补充的回答');
});

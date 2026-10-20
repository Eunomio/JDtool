import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { applyWorkspaceChanges, emptyWorkspace } from '../lib/workspace-data';
export { expect, type Page } from '@playwright/test';

export async function navigate(page: Page, name: string) {
  await page.getByRole('button', { name: '新增JD', exact: true }).first().waitFor();
  const button = page.getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.getByRole('button', { name: '更多功能', exact: true }).click();
  await button.click();
}

// Keep each workflow isolated while exercising the real account bootstrap and synchronization UI.
export async function installWorkflowContext(context: BrowserContext) {
  const user = { id: `workflow-${crypto.randomUUID()}`, username: 'admin', role: 'admin' };
  let data = emptyWorkspace(); let revision = 0;
  const applied = new Set<string>();
  await context.route('**/api/auth/session', route => route.fulfill({ json: { user } }));
  await context.route('**/api/workspace', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      if (!applied.has(input.requestId)) { data = applyWorkspaceChanges(data, input.changes); applied.add(input.requestId); revision++; }
    }
    await route.fulfill({ json: { revision, data } });
  });
  await context.addInitScript(() => { if (location.pathname === '/' && !location.hash) history.replaceState(null, '', '#jobs'); });
  await context.route('**/api/company/research', (route) => route.fulfill({ status: 503, json: { error: { code: 'SEARCH_UNAVAILABLE', message: '公司搜索暂时不可用，可以先准备项目。' } } }));
  await context.route('**/api/jobs/classify', (route) => route.fulfill({ status: 503, json: { error: { code: 'CLASSIFICATION_UNAVAILABLE', message: '岗位归类暂时不可用。' } } }));
}

export const test = base.extend<{ isolateResearch: void }>({
  request: async ({ request }, use) => {
    const login = await request.post('/api/auth/login', { data: { username: 'admin', password: 'admin' } }); expect(login.ok()).toBe(true);
    await use(request);
  },
  isolateResearch: [async ({ context }, use) => {
    await installWorkflowContext(context);
    await use();
  }, { auto: true }],
});

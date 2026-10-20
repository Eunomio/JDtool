import { test as base } from '@playwright/test';
export { expect, type Page } from '@playwright/test';

// Existing workflow tests must never spend real search/model credits during automatic research.
export const test = base.extend<{ isolateResearch: void }>({
  isolateResearch: [async ({ context }, use) => {
    await context.route('**/api/company/research', (route) => route.fulfill({ status: 503, json: { error: { code: 'SEARCH_UNAVAILABLE', message: '公司搜索暂时不可用，可以先准备项目。' } } }));
    await use();
  }, { auto: true }],
});

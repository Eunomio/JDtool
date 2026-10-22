import { test, expect, type APIRequestContext } from '@playwright/test';

async function register(request: APIRequestContext) {
  const response = await request.post('/api/auth/register', { data: { username: `T${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`, password: '123456' } });
  expect(response.status()).toBe(201);
  return (await response.json()).user as { id: string };
}

test('教程需要登录并绑定当前账号，非法操作不会消耗首次展示', async ({ request, playwright, baseURL }) => {
  expect((await request.get('/api/onboarding')).status()).toBe(401);
  expect((await request.post('/api/onboarding', { data: { action: 'claim' } })).status()).toBe(401);
  const user = await register(request); const headers = { 'X-Account-Id': user.id };
  expect((await request.get('/api/onboarding')).status()).toBe(401);
  expect((await request.post('/api/onboarding', { headers, data: { action: 'unknown' } })).status()).toBe(400);
  expect(await (await request.get('/api/onboarding', { headers })).json()).toEqual({ seen: false, status: 'new' });
  const other = await playwright.request.newContext({ baseURL });
  try {
    const second = await register(other);
    expect((await request.post('/api/onboarding', { headers: { 'X-Account-Id': second.id }, data: { action: 'skip' } })).status()).toBe(401);
    expect((await request.post('/api/onboarding', { headers: { ...headers, Origin: 'https://unrelated.example' }, data: { action: 'claim' } })).status()).toBe(403);
  } finally { await other.dispose(); }
});

test('同一账号并发登录只展示一次，跳过完成和重开独立于业务资料', async ({ request, playwright, baseURL }) => {
  const user = await register(request); const headers = { 'X-Account-Id': user.id };
  const other = await playwright.request.newContext({ baseURL, storageState: await request.storageState() });
  try {
    const results = await Promise.all([request, other].map(async client => {
      const response = await client.post('/api/onboarding', { headers, data: { action: 'claim' } });
      expect(response.status()).toBe(200); return (await response.json()).show;
    }));
    expect(results.sort()).toEqual([false, true]);
    for (const [action, status] of [['skip', 'skipped'], ['start', 'started'], ['complete', 'completed']]) {
      expect((await request.post('/api/onboarding', { headers, data: { action } })).status()).toBe(200);
      expect(await (await other.get('/api/onboarding', { headers })).json()).toEqual({ seen: true, status });
      expect(await (await other.post('/api/onboarding', { headers, data: { action: 'claim' } })).json()).toEqual({ show: false });
    }
    const workspace = await (await request.get('/api/workspace', { headers })).json();
    expect(Object.values(workspace.data).every(rows => Array.isArray(rows) && !rows.length)).toBe(true);
    const second = await register(other);
    expect(await (await other.get('/api/onboarding', { headers: { 'X-Account-Id': second.id } })).json()).toEqual({ seen: false, status: 'new' });
  } finally { await other.dispose(); }
});

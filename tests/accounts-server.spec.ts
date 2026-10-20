import { test, expect, type APIRequestContext } from '@playwright/test';
import { emptyWorkspace, workspaceChanges, applyWorkspaceChanges, mergeWorkspace, WorkspaceConflict } from '../lib/workspace-data';

const username = () => `A${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`;
const now = new Date().toISOString();
const job = { id: 'private-job', title: '产品经理', company: '自己的公司', content: '负责需求分析和产品规划。', status: '关注中' as const, nextAction: '', createdAt: now, updatedAt: now };
async function register(request: APIRequestContext) {
  const response = await request.post('/api/auth/register', { data: { username: username(), password: '123456' } }); expect(response.status()).toBe(201); return (await response.json()).user as { id: string; username: string; role: string };
}
async function workspace(request: APIRequestContext, id: string) { const response = await request.get('/api/workspace', { headers: { 'X-Account-Id': id } }); expect(response.status()).toBe(200); return response.json(); }

test('管理员和十个预留账号可登录，只有管理员包含示例资料', async ({ request }) => {
  for (const name of ['admin', ...Array.from({ length: 10 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`)]) {
    const response = await request.post('/api/auth/login', { data: { username: name, password: name === 'admin' ? 'admin' : '123456' } });
    expect(response.status()).toBe(200); const { user } = await response.json();
    expect(Object.keys(user).sort()).toEqual(['id', 'role', 'username']); expect(response.headers()['set-cookie']).toContain('HttpOnly');
    const saved = await workspace(request, user.id);
    if (name === 'admin') { expect(saved.data.jobs.filter((row: { sample: boolean }) => row.sample)).toHaveLength(6); expect(saved.data.projects).toHaveLength(5); }
    else { expect(Object.values(saved.data).every(rows => Array.isArray(rows) && rows.length === 0)).toBe(true); expect(user.role).toBe('member'); }
  }
});

test('注册同时提交同名账号时只有一个成功，忽略大小写，拒绝非字母数字账号', async ({ request, playwright, baseURL }) => {
  const name = username(); const other = await playwright.request.newContext({ baseURL });
  try {
    const responses = await Promise.all([request.post('/api/auth/register', { data: { username: name, password: '123456' } }), other.post('/api/auth/register', { data: { username: name.toLowerCase(), password: '123456' } })]);
    expect(responses.map(response => response.status()).sort()).toEqual([201, 409]);
    for (const invalid of ['中文用户', 'user_name', 'a b', 'a-b', 'a@b']) expect((await request.post('/api/auth/register', { data: { username: invalid, password: '123456' } })).status()).toBe(400);
    expect((await request.post('/api/auth/register', { data: { username: 'p01', password: '123456' } })).status()).toBe(409);
    expect((await request.post('/api/auth/login', { data: { username: name, password: 'wrong-password' } })).status()).toBe(401);
  } finally { await other.dispose(); }
});

test('未登录无法读取资料或调用生成服务，退出会使原登录凭据失效', async ({ request }) => {
  expect((await request.get('/api/workspace')).status()).toBe(401);
  for (const path of ['/api/assist', '/api/jobs/parse', '/api/jobs/classify', '/api/company/research', '/api/project-recommendations', '/api/sources/extract', '/api/documents/read']) expect((await request.post(path, { data: {} })).status()).toBe(401);
  const user = await register(request); const cookies = (await request.storageState()).cookies;
  expect((await request.post('/api/auth/logout')).status()).toBe(200);
  expect((await request.get('/api/workspace', { headers: { 'X-Account-Id': user.id, cookie: cookies.map(row => `${row.name}=${row.value}`).join('; ') } })).status()).toBe(401);
});

test('账号资料仅属于当前会话，伪造账号编号、跨站提交和普通账号保存示例均被拒绝', async ({ request, playwright, baseURL }) => {
  const first = await register(request); const other = await playwright.request.newContext({ baseURL });
  try {
    const second = await register(other);
    expect((await request.get('/api/workspace', { headers: { 'X-Account-Id': second.id } })).status()).toBe(401);
    expect((await request.post('/api/auth/logout', { headers: { Origin: 'https://unrelated.example' } })).status()).toBe(403);
    const before = emptyWorkspace(); const after = { ...before, jobs: [job] };
    const save = await request.post('/api/workspace', { headers: { 'X-Account-Id': first.id }, data: { accountId: second.id, requestId: crypto.randomUUID(), revision: 0, changes: workspaceChanges(before, after) } });
    expect(save.status()).toBe(200); expect((await workspace(other, second.id)).data.jobs).toHaveLength(0);
    const own = await workspace(request, first.id); expect(own.data.jobs).toHaveLength(1);
    const withDemo = { ...own.data, jobs: [...own.data.jobs, { ...job, id: 'sample-forbidden', sample: true }] };
    expect((await request.post('/api/workspace', { headers: { 'X-Account-Id': first.id }, data: { requestId: crypto.randomUUID(), revision: own.revision, changes: workspaceChanges(own.data, withDemo) } })).status()).toBe(403);
    expect((await workspace(request, first.id)).data.jobs).toHaveLength(1);
  } finally { await other.dispose(); }
});

test('重复保存不会增加记录，不同字段的并发修改自动合并，同一字段冲突保留已保存内容', async ({ request }) => {
  const user = await register(request); const headers = { 'X-Account-Id': user.id };
  const body = { requestId: crypto.randomUUID(), revision: 0, changes: workspaceChanges(emptyWorkspace(), { ...emptyWorkspace(), jobs: [job] }) };
  const created = await request.post('/api/workspace', { headers, data: body }); const base = await created.json(); expect(created.status()).toBe(200);
  const duplicate = await request.post('/api/workspace', { headers, data: body }); expect((await duplicate.json()).revision).toBe(base.revision);
  const a = { ...base.data, jobs: [{ ...job, status: '面试中' }] }; const b = { ...base.data, jobs: [{ ...job, nextAction: '准备项目' }] };
  expect((await request.post('/api/workspace', { headers, data: { requestId: crypto.randomUUID(), revision: base.revision, changes: workspaceChanges(base.data, a) } })).status()).toBe(200);
  expect((await request.post('/api/workspace', { headers, data: { requestId: crypto.randomUUID(), revision: base.revision, changes: workspaceChanges(base.data, b) } })).status()).toBe(200);
  expect((await workspace(request, user.id)).data.jobs[0]).toMatchObject({ status: '面试中', nextAction: '准备项目' });
  const conflict = { ...base.data, jobs: [{ ...job, status: '已结束' }] };
  expect((await request.post('/api/workspace', { headers, data: { requestId: crypto.randomUUID(), revision: base.revision, changes: workspaceChanges(base.data, conflict) } })).status()).toBe(409);
  expect((await workspace(request, user.id)).data.jobs[0].status).toBe('面试中');
});

test('合并不会恢复远端已删除的记录，冲突时原对象保持完整', () => {
  const base = { ...emptyWorkspace(), jobs: [job] }; const local = { ...base, jobs: [{ ...job, nextAction: '新计划' }] };
  const remote = emptyWorkspace(); expect(() => mergeWorkspace(base, local, remote)).toThrow(WorkspaceConflict);
  expect(remote.jobs).toHaveLength(0); expect(base.jobs[0].nextAction).toBe('');
  expect(applyWorkspaceChanges(base, workspaceChanges(base, local)).jobs[0].nextAction).toBe('新计划');
});

test('后台检查资料未变化时只返回版本，保存更新后返回新的资料', async ({ request }) => {
  const user = await register(request); const headers = { 'X-Account-Id': user.id };
  const first = await request.get('/api/workspace', { headers }); const etag = first.headers().etag;
  const same = await request.get('/api/workspace', { headers: { ...headers, 'If-None-Match': etag } }); expect(same.status()).toBe(304); expect(await same.body()).toHaveLength(0);
  expect((await request.post('/api/workspace', { headers, data: { requestId: crypto.randomUUID(), revision: 0, changes: workspaceChanges(emptyWorkspace(), { ...emptyWorkspace(), jobs: [job] }) } })).status()).toBe(200);
  const changed = await request.get('/api/workspace', { headers: { ...headers, 'If-None-Match': etag } }); expect(changed.status()).toBe(200); expect(changed.headers().etag).not.toBe(etag); expect((await changed.json()).data.jobs).toHaveLength(1);
});

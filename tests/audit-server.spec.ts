import { test, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { bailianSearch } from '../lib/bailian-search';
import { parseBackup } from '../lib/backup';
import { emptyPersonalProfile } from '../lib/personal-profile';

test('搜索流重复播报旧来源时仍保留后续新增来源，并按链接去重', async () => {
  const keys = ['APP_DATA_DIR', 'DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'DASHSCOPE_SEARCH_MODEL']; const previous = keys.map(key => [key, process.env[key]] as const); const original = globalThis.fetch;
  await mkdir('.local', { recursive: true }); process.env.APP_DATA_DIR = await mkdtemp('.local/audit-search-'); process.env.DASHSCOPE_API_KEY = 'audit-test-key'; process.env.DASHSCOPE_BASE_URL = 'https://search.test.invalid/compatible-mode/v1';
  try {
    const first = { title: '官网产品介绍', url: 'https://example.com/products' }; const later = { title: '官网业务介绍', url: 'https://example.com/business' };
    const events = [...Array.from({ length: 30 }, () => [first]), [first, later]].map(search_results => `data: ${JSON.stringify({ output: { search_info: { search_results } } })}\n\n`).join('');
    globalThis.fetch = async () => new Response(events, { headers: { 'Content-Type': 'text/event-stream' } }); const hits = await bailianSearch('示例公司业务', new AbortController().signal); expect(hits).toHaveLength(2); expect(hits).toEqual(expect.arrayContaining([expect.objectContaining({ url: later.url })]));
  } finally { globalThis.fetch = original; for (const [key, value] of previous) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('教育经历编号重复的备份在写入前被拒绝', () => {
  const education = { id: 'duplicate-education', school: '示例大学', major: '设计', degree: '本科', startMonth: '2022-09', endMonth: '2026-06' };
  expect(() => parseBackup({ format: 'jdtool-backup', version: 2, jobs: [], profiles: [{ ...emptyPersonalProfile(), education: [education, { ...education, school: '另一所示例大学' }] }] })).toThrow();
});

test('发布凭据检查只读取已跟踪文件，忽略未提交的私有资料并继续阻止凭据提交', async () => {
  await mkdir('.local', { recursive: true }); const directory = resolve(await mkdtemp('.local/audit-publish-')); const script = resolve('scripts/check-publish.mjs'); const key = 'audit-fake-key-never-use';
  execFileSync('git', ['init', '--quiet', directory]); await writeFile(join(directory, 'tracked.txt'), '允许发布的文件'); await writeFile(join(directory, 'private-untracked.txt'), key); execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: directory });
  const options = { cwd: directory, env: { ...process.env, CHAT_ECNU_API_KEY: key }, stdio: 'pipe' as const };
  expect(() => execFileSync(process.execPath, [script], options)).not.toThrow(); await writeFile(join(directory, 'tracked.txt'), key); expect(() => execFileSync(process.execPath, [script], options)).toThrow();
  execFileSync('git', ['add', '--', 'tracked.txt'], { cwd: directory }); await writeFile(join(directory, 'tracked.txt'), '工作区已清理，但暂存区仍有凭据');
  expect(() => execFileSync(process.execPath, [script], options)).toThrow();
});

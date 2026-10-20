import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const token = process.env.MODELSCOPE_API_KEY;
const endpoint = process.env.MODELSCOPE_ENDPOINT || 'https://modelscope.cn';
if (!token) throw new Error('请在 .env.local 配置 MODELSCOPE_API_KEY');
if (endpoint !== 'https://modelscope.cn') throw new Error('当前脚本只允许连接国内魔搭站点');

const action = process.argv[2] || 'probe';
const repo = process.argv[3] || 'JDtool';
if (!/^[a-zA-Z0-9_-]+$/.test(repo)) throw new Error('创空间名称仅支持字母、数字、下划线和横线');

function redact(value) {
  return JSON.stringify(value).replaceAll(token, '[redacted]');
}

async function request(path, method = 'GET', body) {
  const response = await fetch(`${endpoint}/openapi/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`魔搭 ${path} 返回 HTTP ${response.status}，内容非JSON`); }
  if (!response.ok || result.success === false) {
    const error = new Error(`魔搭 ${path} HTTP ${response.status}: ${redact({ code: result.code, message: result.message })}`);
    error.status = response.status;
    throw error;
  }
  return result.data ?? result;
}

function records(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['items', 'hardware', 'list', 'resources']) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

try {
  const user = await request('/users/me');
  const owner = user.username || user.user_name || user.name;
  if (typeof owner !== 'string' || !/^[a-zA-Z0-9_.-]+$/.test(owner)) {
    throw new Error(`无法确定账号名称；返回字段：${Object.keys(user).join(', ')}`);
  }
  console.log(redact({ account: owner, authenticated: true }));
  const hardware = await request('/studios/hardware?sdk_type=docker');
  console.log(redact({ dockerHardware: hardware }));
  if (action === 'probe') process.exit(0);
  const path = `/studios/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  if (action === 'create') {
    let existing;
    try { existing = await request(path); } catch (error) { if (error.status !== 404) throw error; }
    if (existing) {
      console.log(redact({ existingStudio: existing }));
      process.exit(0);
    }
    const free = records(hardware).find((item) => item.name?.startsWith('platform/') && item.resource_type === 'free');
    if (!free) throw new Error('未找到可确认的免费CPU资源，未创建创空间');
    const created = await request('/studios', 'POST', {
      owner, repo_name: repo, sdk_type: 'docker', visibility: 'private',
      hardware: free.name, display_name: '岗位探索与求职准备助手',
      description: '从JD理解岗位，整理真实项目经历并准备面试。',
    });
    mkdirSync('.local', { recursive: true });
    writeFileSync('.local/modelscope-studio.json', JSON.stringify({ owner, repo, hardware: free.name }, null, 2));
    console.log(redact({ createdStudio: created, url: `${endpoint}/studios/${owner}/${repo}` }));
  } else if (action === 'info') {
    console.log(redact({ studio: await request(path) }));
  } else if (action === 'deploy') {
    const studio = await request(path);
    const selected = studio.hardware || studio.resource_configuration;
    if (typeof selected !== 'string' || !selected.startsWith('platform/')) throw new Error('无法确认当前空间使用免费资源，未触发部署');
    console.log(redact({ deployment: await request(`${path}/deploy`, 'POST') }));
  } else {
    throw new Error('支持的命令：probe、create、info、deploy');
  }
} catch (error) {
  console.error(String(error.message).replaceAll(token, '[redacted]'));
  process.exitCode = 1;
}

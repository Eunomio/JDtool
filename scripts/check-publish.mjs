import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const secrets = ['MODELSCOPE_API_KEY', 'CHAT_ECNU_API_KEY', 'BOCHA_API_KEY', 'TAVILY_API_KEY', 'GH_TOKEN', 'GITHUB_TOKEN']
  .map((name) => process.env[name]).filter((value) => value && value.length >= 8);
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
for (const file of files) {
  if (file === '.env.local' || file.startsWith('.local/')) failures.push(file);
  const content = readFileSync(file);
  if (secrets.some((secret) => content.includes(Buffer.from(secret)))) failures.push(file);
}
if (failures.length) {
  console.error('以下文件包含本地凭据或不应上传：', [...new Set(failures)].join(', '));
  process.exitCode = 1;
} else {
  console.log(`已检查 ${files.length} 个待上传文件，未发现已配置的凭据。`);
}

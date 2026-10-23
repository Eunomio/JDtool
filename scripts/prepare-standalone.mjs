import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';

cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
if (existsSync('public')) cpSync('public', '.next/standalone/public', { recursive: true });
for (const name of ['playwright', 'playwright-core']) cpSync(`node_modules/${name}`, `.next/standalone/node_modules/${name}`, { recursive: true });
const nativePlatform = process.platform === 'win32' ? 'win' : process.platform;
for (const name of ['sherpa-onnx-node', `sherpa-onnx-${nativePlatform}-${process.arch}`]) cpSync(`node_modules/${name}`, `.next/standalone/node_modules/${name}`, { recursive: true });
mkdirSync('.next/standalone/scripts', { recursive: true });
for (const name of ['asr-worker.cjs', 'check-deploy-size.mjs']) cpSync(`scripts/${name}`, `.next/standalone/scripts/${name}`);
for (const name of readdirSync('.next/standalone')) if (name === '.env' || name.startsWith('.env.')) rmSync(`.next/standalone/${name}`);

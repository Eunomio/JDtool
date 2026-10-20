import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';

cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
if (existsSync('public')) cpSync('public', '.next/standalone/public', { recursive: true });
for (const name of ['playwright', 'playwright-core']) cpSync(`node_modules/${name}`, `.next/standalone/node_modules/${name}`, { recursive: true });
for (const name of readdirSync('.next/standalone')) if (name === '.env' || name.startsWith('.env.')) rmSync(`.next/standalone/${name}`);

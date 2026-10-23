import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const child = spawn(process.execPath, ['.next/standalone/server.js'], {
  stdio: 'inherit',
  env: { ...process.env, ASR_MODEL_DIR: process.env.ASR_MODEL_DIR || resolve('.local/asr-model'), APP_DATA_DIR: process.env.APP_DATA_DIR || resolve('.local', 'accounts'), HOSTNAME: '0.0.0.0', PORT: process.env.PORT || '7860' },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 1));

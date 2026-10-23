import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
async function size(path) { const item = await stat(path); if (!item.isDirectory()) return item.size; let bytes = 0; for (const name of await readdir(path)) bytes += await size(join(path, name)); return bytes; }
const model = await size(process.env.ASR_MODEL_DIR || '/opt/jdtool-asr');
const native = await size('node_modules/sherpa-onnx-node') + await size(`node_modules/sherpa-onnx-linux-${process.arch}`);
if (model + native > 320 * 1024 * 1024) throw Error('ASR install exceeds 320MiB budget');
let usage;
try { usage = execFileSync('du', ['-xsm', '/'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (error) { usage = String(error.stdout || ''); }
const fullImageMiB = Number.parseInt(usage, 10);
if (!Number.isFinite(fullImageMiB) || fullImageMiB > 2048) throw Error(`Runtime image exceeds 2GiB budget (${fullImageMiB}MiB)`);
console.log(JSON.stringify({ deploySizeVerified: true, asrInstallBytes: model + native, fullImageMiB, fullImageLimitMiB: 2048, asrLimitMiB: 320 }));

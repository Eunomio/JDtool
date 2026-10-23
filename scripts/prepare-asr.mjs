import { createWriteStream } from 'node:fs';
import { mkdir, readFile, stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const name = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17';
const expectedArchive = '7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e';
const files = { 'model.int8.onnx': 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51', 'tokens.txt': 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc', LICENSE: '221c6df10b0931a5629adad671ea48fb7747e034c414b6d2bfa275bc3dd4ea17' };
const directory = resolve(process.argv[2] || '.local/asr-model'); await mkdir(directory, { recursive: true });
async function valid() { try { return (await Promise.all(Object.entries(files).map(async ([file, hash]) => createHash('sha256').update(await readFile(join(directory, file))).digest('hex') === hash))).every(Boolean); } catch { return false; } }
if (!await valid()) {
  const archive = join(directory, 'source.tar.bz2');
  try {
    const response = await fetch(`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${name}.tar.bz2`, { signal: AbortSignal.timeout(300000) });
    if (!response.ok || !response.body) throw Error(`ASR download failed: ${response.status}`);
    const hash = createHash('sha256'); let bytes = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) { bytes += chunk.length; if (bytes > 180 * 1024 * 1024) return callback(Error('ASR archive exceeds budget')); hash.update(chunk); callback(null, chunk); } }), createWriteStream(archive));
    if (hash.digest('hex') !== expectedArchive) throw Error('ASR archive checksum mismatch');
    execFileSync('tar', ['-xjf', archive, '-C', directory, '--strip-components=1', ...Object.keys(files).map(file => `${name}/${file}`)], { stdio: 'pipe' });
    if (!await valid()) throw Error('ASR model checksum mismatch');
  } finally { await unlink(archive).catch(() => {}); }
}
const bytes = (await Promise.all(Object.keys(files).map(file => stat(join(directory, file))))).reduce((sum, item) => sum + item.size, 0);
if (bytes > 240 * 1024 * 1024) throw Error('ASR model exceeds installation budget');
console.log(JSON.stringify({ asrModelReady: true, modelBytes: bytes, modelMiB: Math.ceil(bytes / 1024 / 1024), checksumVerified: true }));

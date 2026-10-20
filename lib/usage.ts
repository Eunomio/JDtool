import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from './errors';

let queue: Promise<void> = Promise.resolve();
const windows = new Map<string, { count: number; until: number }>();

export function limitRequest(request: Request) {
  const key = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous').split(',')[0].trim();
  const now = Date.now();
  if (windows.size > 500) for (const [key, window] of windows) if (window.until < now) windows.delete(key);
  const window = windows.get(key);
  if (!window || window.until < now) { windows.set(key, { count: 1, until: now + 60000 }); return; }
  if (window.count >= 15) throw new AppError(429, 'TOO_MANY_REQUESTS', '本次使用较多，请稍后再试。');
  window.count++;
}

export async function reserveModelCall() {
  const operation = queue.catch(() => {}).then(async () => {
    const directory = process.env.APP_DATA_DIR || join(process.cwd(), '.local', 'usage');
    const date = new Date().toISOString().slice(0, 10);
    const file = join(directory, 'model-usage.json');
    const limit = Number(process.env.DAILY_MODEL_REQUEST_LIMIT || 200);
    try {
      await mkdir(directory, { recursive: true });
      let current = { date, count: 0 };
      try { const saved = JSON.parse(await readFile(file, 'utf8')); if (saved.date === date && Number.isSafeInteger(saved.count)) current = saved; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (!Number.isFinite(limit) || limit <= 0 || current.count >= limit) throw new AppError(429, 'DAILY_LIMIT', '今天的使用次数已达到上限，已保存的资料仍可查看和编辑。');
      const temporary = `${file}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ date, count: current.count + 1 }), { mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Usage accounting unavailable');
      throw new AppError(503, 'USAGE_UNAVAILABLE', '暂时无法处理新的生成请求，请稍后重试。');
    }
  });
  queue = operation;
  await operation;
}

import { z } from 'zod';
import { accountStore, requireUser } from '../../../lib/account-server';
import { AppError, errorResponse, readJson } from '../../../lib/errors';

export const runtime = 'nodejs';
const input = z.object({ action: z.enum(['claim', 'start', 'skip', 'complete']) });
type Record = { first_seen_at: string; status: 'started' | 'skipped' | 'completed'; updated_at: string };
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, true);
    const row = (await accountStore()).prepare('SELECT first_seen_at, status, updated_at FROM account_onboarding WHERE account_id = ?').get(user.id) as Record | undefined;
    return Response.json({ seen: !!row, status: row?.status || 'new' }, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true);
    const parsed = input.safeParse(await readJson(request, 2048));
    if (!parsed.success) throw new AppError(400, 'INVALID_TUTORIAL', '教程状态未能保存，请稍后重试。');
    const db = await accountStore(); const now = new Date().toISOString();
    if (parsed.data.action === 'claim') {
      // A single account is welcomed once, including simultaneous tabs or browsers.
      const inserted = db.prepare("INSERT OR IGNORE INTO account_onboarding VALUES (?, ?, 'started', ?)").run(user.id, now, now);
      return Response.json({ show: !!inserted.changes }, { headers });
    }
    const status = parsed.data.action === 'complete' ? 'completed' : parsed.data.action === 'skip' ? 'skipped' : 'started';
    db.prepare('INSERT INTO account_onboarding VALUES (?, ?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at').run(user.id, now, status, now);
    return Response.json({ seen: true, status }, { headers });
  } catch (error) { return errorResponse(error); }
}

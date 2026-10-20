import { z } from 'zod';
import { accountStore, requireUser } from '../../../lib/account-server';
import { AppError, errorResponse, readJson } from '../../../lib/errors';
import { parseBackup } from '../../../lib/backup';
import { applyWorkspaceChanges, hasDemoData, sameData, workspaceTables, WorkspaceConflict, type WorkspaceSnapshot } from '../../../lib/workspace-data';

export const runtime = 'nodejs';
const row = z.object({ id: z.string().min(1).max(300) }).catchall(z.unknown());
const inputSchema = z.object({ requestId: z.uuid(), revision: z.number().int().nonnegative(), changes: z.array(z.object({ table: z.enum(workspaceTables), id: z.string().min(1).max(300), before: row.nullable(), after: row.nullable() })).max(10000) });
const snapshot = (record: { revision: number; data: string }): WorkspaceSnapshot => ({ revision: record.revision, data: JSON.parse(record.data) });

export async function GET(request: Request) {
  try {
    const user = await requireUser(request, true); const db = await accountStore();
    const { revision } = db.prepare('SELECT revision FROM workspaces WHERE account_id = ?').get(user.id) as { revision: number };
    const headers = { 'Cache-Control': 'no-store', ETag: `"${revision}"`, Vary: 'Cookie, X-Account-Id' };
    if (request.headers.get('if-none-match') === headers.ETag) return new Response(null, { status: 304, headers });
    return Response.json(snapshot(db.prepare('SELECT revision, data FROM workspaces WHERE account_id = ?').get(user.id) as { revision: number; data: string }), { headers });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true); const parsed = inputSchema.safeParse(await readJson(request, 85_000_000));
    if (!parsed.success) throw new AppError(400, 'INVALID_WORKSPACE', '资料格式有误，请保留本页内容后重试。');
    const input = parsed.data;
    if (new Set(input.changes.map(row => `${row.table}:${row.id}`)).size !== input.changes.length) throw new AppError(400, 'DUPLICATE_CHANGE', '资料中包含重复记录，请重试。');
    const db = await accountStore(); db.exec('BEGIN IMMEDIATE');
    try {
      const current = snapshot(db.prepare('SELECT revision, data FROM workspaces WHERE account_id = ?').get(user.id) as { revision: number; data: string });
      if (db.prepare('SELECT request_id FROM workspace_requests WHERE account_id = ? AND request_id = ?').get(user.id, input.requestId)) { db.exec('COMMIT'); return Response.json(current, { headers: { 'Cache-Control': 'no-store' } }); }
      if (input.revision > current.revision) throw new WorkspaceConflict();
      const merged = applyWorkspaceChanges(current.data, input.changes);
      let data;
      try { const validated = parseBackup({ format: 'jdtool-backup', version: 2, ...merged }); data = Object.fromEntries(workspaceTables.map(table => [table, validated[table]])) as typeof merged; }
      catch { throw new AppError(400, 'INVALID_WORKSPACE', '资料格式有误，请检查备份或重试。'); }
      if (user.role !== 'admin' && hasDemoData(data)) throw new AppError(403, 'DEMO_ADMIN_ONLY', '示例资料仅保存在管理员账号中，请使用自己的资料。');
      const ids = new Set(data.jobs.map(job => job.id));
      if (['sources', 'recommendations', 'preparations', 'companies', 'practice'].some(table => data[table as 'sources'].some(record => record.jobId && !ids.has(record.jobId))) || data.tasks.some(task => task.jobIds.some(id => !ids.has(id))) || data.comparisons.some(record => record.jobId.split('|').some(id => !ids.has(id)))) throw new WorkspaceConflict();
      const result = { revision: current.revision + (sameData(current.data, data) ? 0 : 1), data };
      db.prepare('UPDATE workspaces SET revision = ?, data = ? WHERE account_id = ?').run(result.revision, JSON.stringify(data), user.id);
      db.prepare('INSERT INTO workspace_requests VALUES (?, ?, ?)').run(user.id, input.requestId, Date.now());
      db.prepare('DELETE FROM workspace_requests WHERE created_at < ?').run(Date.now() - 30 * 24 * 60 * 60 * 1000);
      db.exec('COMMIT');
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } catch (error) { return errorResponse(error instanceof WorkspaceConflict ? new AppError(409, 'WORKSPACE_CONFLICT', error.message) : error); }
}

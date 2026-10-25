import { accountStore, requireUser } from '../../../lib/account-server';
import { errorResponse, readJson, AppError } from '../../../lib/errors';
import { limitRequest } from '../../../lib/usage';
import { withModelRequest } from '../../../lib/model';
import { answerProductQuestion, productChatInput } from '../../../lib/product-chat';
import type { WorkspaceData } from '../../../lib/workspace-data';

export const runtime = 'nodejs';
export const maxDuration = 150;
export async function POST(request: Request) {
  try {
    const user = await requireUser(request, true); limitRequest(request);
    const input = productChatInput.safeParse(await readJson(request, 120000));
    if (!input.success) throw new AppError(400, 'INVALID_QUESTION', '请缩短提问后再试。');
    return await withModelRequest(request, async () => {
      const db = await accountStore(); const record = db.prepare('SELECT data FROM workspaces WHERE account_id = ?').get(user.id) as { data: string };
      return Response.json(await answerProductQuestion(input.data, JSON.parse(record.data) as WorkspaceData), { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (error) { return errorResponse(error); }
}

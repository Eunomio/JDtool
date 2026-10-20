import { requireUser } from '../../../lib/account-server';
import { assist, assistInput } from '../../../lib/assistant';
import { AppError, errorResponse, readJson } from '../../../lib/errors';
import { limitRequest } from '../../../lib/usage';
import { withModelRequest } from '../../../lib/model';

export const runtime = 'nodejs';
export const maxDuration = 150;
export async function POST(request: Request) {
  try {
    await requireUser(request);
    limitRequest(request);
    return await withModelRequest(request, async () => {
      const body = await readJson(request, 1_200_000);
      const input = assistInput.safeParse({ ...(body as object), action: 'recommendations' });
      if (!input.success) throw new AppError(400, 'INVALID_INPUT', '请核对岗位要求和已确认的项目事实。');
      return Response.json(await assist(input.data), { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (error) { return errorResponse(error); }
}

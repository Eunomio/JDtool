import { assist, assistInput } from '../../../lib/assistant';
import { AppError, errorResponse, readJson } from '../../../lib/errors';
import { limitRequest } from '../../../lib/usage';
import { withModelRequest } from '../../../lib/model';

export const runtime = 'nodejs';
export const maxDuration = 150;
export async function POST(request: Request) {
  try {
    limitRequest(request);
    return await withModelRequest(request, async () => {
      const input = assistInput.safeParse(await readJson(request, 1_200_000));
      if (!input.success) throw new AppError(400, 'INVALID_INPUT', '资料不完整或过长，请核对所选岗位和项目。');
      return Response.json(await assist(input.data), { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (error) { return errorResponse(error); }
}

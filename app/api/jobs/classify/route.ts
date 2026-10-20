import { requireUser } from '../../../../lib/account-server';
import { AppError, errorResponse, readJson } from '../../../../lib/errors';
import { classifyInputSchema, classifyJobs } from '../../../../lib/role-classification';
import { withModelRequest } from '../../../../lib/model';
import { limitRequest } from '../../../../lib/usage';

export const runtime = 'nodejs';
export const maxDuration = 150;
export async function POST(request: Request) {
  try {
    await requireUser(request);
    limitRequest(request);
    return await withModelRequest(request, async () => {
      const input = classifyInputSchema.safeParse(await readJson(request, 650000));
      if (!input.success) throw new AppError(400, 'INVALID_CLASSIFICATION_INPUT', '每次可归类1—6个岗位，请先补充完整JD。');
      return Response.json(await classifyJobs(input.data), { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (error) { return errorResponse(error); }
}

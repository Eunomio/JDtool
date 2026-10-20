import { requireUser } from '../../../../lib/account-server';
import { z } from 'zod';
import { AppError, errorResponse, readJson } from '../../../../lib/errors';
import { readSource } from '../../../../lib/source-reader';
import { limitRequest } from '../../../../lib/usage';

export const runtime = 'nodejs';
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    await requireUser(request);
    limitRequest(request);
    const input = z.object({ url: z.string().max(2000) }).safeParse(await readJson(request, 10000));
    if (!input.success) throw new AppError(400, 'INVALID_URL', '请提供公开网页链接。');
    return Response.json(await readSource(input.data.url, 'general'), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

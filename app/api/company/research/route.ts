import { requireUser } from '../../../../lib/account-server';
import { researchCompany, researchInput } from '../../../../lib/company-research';
import { AppError, errorResponse, readJson } from '../../../../lib/errors';
import { limitRequest } from '../../../../lib/usage';
import { withModelRequest } from '../../../../lib/model';
import { searchConfiguration } from '../../../../lib/web-search';
import { researchStream } from '../../../../lib/research-stream';

export const runtime = 'nodejs';
export const maxDuration = 150;
let activeResearch = 0;
export async function POST(request: Request) {
  try {
    await requireUser(request);
    limitRequest(request);
    const input = researchInput.safeParse(await readJson(request, 180000));
    if (!input.success) throw new AppError(400, 'INVALID_COMPANY', '请先补充公司名称，再搜索业务资料。');
    if (!input.data.sources?.length) searchConfiguration();
    if (activeResearch >= 2) throw new AppError(429, 'RESEARCH_BUSY', '正在整理其他公司的资料，请稍后再试。');
    activeResearch++;
    const stream = researchStream(request.signal, async (signal, emit) => {
      const scopedRequest = new Request(request.url, { signal });
      try { await withModelRequest(scopedRequest, () => researchCompany(input.data, emit)); }
      finally { activeResearch--; }
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  } catch (error) { return errorResponse(error); }
}

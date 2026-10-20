import { z } from 'zod';
import { AppError, errorResponse, readJson } from '../../../../lib/errors';
import { parseJob } from '../../../../lib/job-parser';
import { readSource } from '../../../../lib/source-reader';
import { limitRequest } from '../../../../lib/usage';
import { withModelRequest } from '../../../../lib/model';

export const runtime = 'nodejs';
export const maxDuration = 180;
const inputSchema = z.object({
  type: z.enum(['link', 'images', 'text']), url: z.string().max(2000).optional(), text: z.string().max(45_000).optional(),
  images: z.array(z.object({ name: z.string().max(300), dataUrl: z.string().max(3_400_000) })).max(3).optional(),
});

export async function POST(request: Request) {
  try {
    limitRequest(request);
    return await withModelRequest(request, async () => {
      const validated = inputSchema.safeParse(await readJson(request));
      if (!validated.success) throw new AppError(400, 'INVALID_INPUT', '请核对链接、正文或截图，最多上传3张截图。');
      const input = validated.data;
      let text = input.text?.trim() || '';
      let sourceUrl = input.url || '';
      if (input.type === 'link') {
        const source = await readSource(sourceUrl);
        text = source.text;
        sourceUrl = source.sourceUrl;
      }
      if (input.type === 'images' && !input.images?.length) throw new AppError(400, 'EMPTY_INPUT', '请先选择JD截图。');
      if (input.type !== 'images' && text.length < 15) throw new AppError(400, 'EMPTY_INPUT', '请补充岗位职责或要求后再解析。');
      const job = await parseJob(text, input.type === 'images' ? input.images : []);
      return Response.json({ job, sourceUrl, sourceType: input.type, parsedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
    });
  } catch (error) { return errorResponse(error); }
}

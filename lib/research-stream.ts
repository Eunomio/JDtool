import type { ResearchEvent } from './company-research';
import { AppError } from './errors';

export function researchStream(
  signal: AbortSignal,
  run: (signal: AbortSignal, emit: (event: ResearchEvent) => void) => Promise<unknown>,
  heartbeatMs = 15000,
) {
  const cancellation = new AbortController();
  const combined = AbortSignal.any([signal, cancellation.signal]);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let stage: string | undefined;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ResearchEvent) => {
        if (closed || combined.aborted) return;
        if (event.type === 'progress') stage = event.stage;
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };
      // Some hosting proxies close a connection with no data for about two minutes.
      heartbeat = setInterval(() => emit({ type: 'heartbeat' }), heartbeatMs);
      try { await run(combined, emit); }
      catch (error) {
        const analysisFailed = stage === 'analyzing' && (!(error instanceof AppError) || ['MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'INVALID_RESEARCH', 'INVALID_RESULT', 'INCOMPLETE_RESULT'].includes(error.code));
        const message = analysisFailed
          ? `公司资料已保存，${error instanceof AppError && error.code === 'MODEL_TIMEOUT' ? '分析等待超时' : '分析返回的内容未完整生成'}，可点击“重新分析”继续。`
          : stage === 'analyzing' && error instanceof AppError && error.code === 'MODEL_RATE_LIMITED' ? '公司资料已保存，当前分析请求较多，请稍后点击“重新分析”。'
          : error instanceof AppError ? error.message : '这次搜索尚未完成，已读取的资料会保留，请稍后重试。';
        emit({ type: 'error', message });
      } finally {
        clearInterval(heartbeat);
        if (!closed) { closed = true; controller.close(); }
      }
    },
    cancel() { closed = true; clearInterval(heartbeat); cancellation.abort(); },
  });
}

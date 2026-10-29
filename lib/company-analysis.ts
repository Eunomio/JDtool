import { AppError } from './errors';

export async function retryCompanyAnalysis<T>(signal: AbortSignal, action: (signal: AbortSignal) => Promise<T>, onRetry?: () => void): Promise<T> {
  const attempt = () => {
    signal.throwIfAborted();
    return action(AbortSignal.any([signal, AbortSignal.timeout(50000)]));
  };
  try { return await attempt(); }
  catch (error) {
    if (signal.aborted || !(error instanceof AppError) || !['MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'INVALID_RESULT', 'INCOMPLETE_RESULT', 'INVALID_RESEARCH'].includes(error.code)) throw error;
  }
  onRetry?.();
  return attempt();
}

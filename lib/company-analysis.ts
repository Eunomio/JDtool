import { AppError } from './errors';

export async function retryCompanyAnalysis<T>(signal: AbortSignal, action: (signal: AbortSignal, attempt: 0 | 1) => Promise<T>, onRetry?: () => void): Promise<T> {
  const attempt = (index: 0 | 1) => {
    signal.throwIfAborted();
    return action(AbortSignal.any([signal, AbortSignal.timeout(index === 0 ? 75000 : 50000)]), index);
  };
  try { return await attempt(0); }
  catch (error) {
    console.warn('Company analysis attempt failed', { attempt: 0, code: error instanceof AppError ? error.code : 'UNKNOWN' });
    if (signal.aborted || !(error instanceof AppError) || !['MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'MODEL_RATE_LIMITED', 'INVALID_RESULT', 'INCOMPLETE_RESULT', 'INVALID_RESEARCH'].includes(error.code)) throw error;
  }
  onRetry?.();
  return attempt(1);
}

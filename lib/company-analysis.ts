import { AppError } from './errors';

export async function retryCompanyAnalysis<T>(signal: AbortSignal, action: (signal: AbortSignal, attempt: 0 | 1 | 2) => Promise<T>, onRetry?: () => void): Promise<T> {
  const fallback = process.env.COMPANY_ANALYSIS_FALLBACK_PROVIDER === 'bailian';
  const limits = fallback ? [40000, 25000, 55000] : [75000, 50000];
  const recoverable = ['MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'MODEL_RATE_LIMITED', 'INVALID_RESULT', 'INCOMPLETE_RESULT', 'INVALID_RESEARCH', 'NO_GROUNDED_RESEARCH'];
  const attempt = async (index: 0 | 1 | 2): Promise<T> => {
    signal.throwIfAborted();
    try { return await action(AbortSignal.any([signal, AbortSignal.timeout(limits[index])]), index); }
    catch (error) {
      console.warn('Company analysis attempt failed', { attempt: index, code: error instanceof AppError ? error.code : 'UNKNOWN' });
      if (signal.aborted || !(error instanceof AppError) || index === limits.length - 1) throw error;
      const fallbackError = fallback && ['MODEL_CONFIGURATION', 'MODEL_QUOTA_EXHAUSTED'].includes(error.code);
      if (!recoverable.includes(error.code) && !fallbackError) throw error;
      onRetry?.();
      return attempt((index + 1) as 1 | 2);
    }
  };
  return attempt(0);
}

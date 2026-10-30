import { AppError } from './errors';

type Environment = Record<string, string | undefined>;

export function bailianConfiguration(env: Environment = process.env) {
  const key = env.DASHSCOPE_API_KEY?.trim();
  if (!key) throw new AppError(503, 'MODEL_UNAVAILABLE', '暂时无法处理，请稍后重试。输入内容已保留。');
  return { provider: 'bailian' as const, key, base: (env.DASHSCOPE_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, ''), model: env.DASHSCOPE_MODEL?.trim() || 'qwen3.8-27b' };
}

export function modelConfiguration(env: Environment = process.env) {
  const provider = env.MODEL_PROVIDER?.trim() || 'auto';
  if (provider === 'bailian' || (provider === 'auto' && !env.CHAT_ECNU_API_KEY?.trim() && env.DASHSCOPE_API_KEY?.trim())) return bailianConfiguration(env);
  if (!['auto', 'chatecnu'].includes(provider)) throw new AppError(503, 'MODEL_CONFIGURATION', '暂时无法处理，请稍后重试。输入内容已保留。');
  const key = env.CHAT_ECNU_API_KEY?.trim();
  if (!key) throw new AppError(503, 'MODEL_UNAVAILABLE', '暂时无法解析，请稍后重试。你也可以保留原文继续整理。');
  return { provider: 'chatecnu' as const, key, base: (env.CHAT_ECNU_BASE_URL?.trim() || 'https://chat.ecnu.edu.cn/open/api/v1').replace(/\/$/, ''), model: env.CHAT_ECNU_MODEL?.trim() || 'ecnu-plus' };
}

export function searchModelConfiguration(env: Environment = process.env) {
  return { ...bailianConfiguration(env), model: env.DASHSCOPE_SEARCH_MODEL?.trim() || 'qwen3.8-flash' };
}

export function companyFallbackConfiguration(env: Environment = process.env) {
  if (env.COMPANY_ANALYSIS_FALLBACK_PROVIDER !== 'bailian') throw new AppError(503, 'MODEL_CONFIGURATION', '备用分析暂未配置，请联系管理员检查。');
  return { ...bailianConfiguration(env), model: env.DASHSCOPE_COMPANY_MODEL?.trim() || env.DASHSCOPE_SEARCH_MODEL?.trim() || 'qwen3.8-flash' };
}

import { accountRequestHeaders } from './database';
import { beginActivity, requestLabel } from './request-activity';

export async function api<T>(path: string, input: unknown, options: { signal?: AbortSignal; quiet?: boolean } = {}): Promise<T> {
  const controller = new AbortController();
  const finish = options.quiet ? () => {} : beginActivity(requestLabel(path, input), () => controller.abort());
  const signal = AbortSignal.any([AbortSignal.timeout(180_000), controller.signal, ...(options.signal ? [options.signal] : [])]);
  try {
  let response: Response;
  try { response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...accountRequestHeaders() }, body: JSON.stringify(input), signal }); }
  catch { throw new Error(controller.signal.aborted || options.signal?.aborted ? '已停止处理，输入内容已保留。' : '连接等待较久，输入资料已保留，请稍后重试。'); }
  const result = await response.json().catch(() => { throw new Error('暂时无法完成，输入资料已保留，请稍后重试。'); });
  if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('jdtool-account-changed'));
  if (!response.ok) throw new Error(result.error?.message || '暂时无法完成，请重试。');
  return result as T;
  } finally { finish(); }
}

export {inputVersion} from './input-version';

export { displayText, displayProjectText, safeProject, modelProjects } from './project-privacy';

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

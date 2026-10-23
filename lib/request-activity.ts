export type RequestActivity = { id: string; label: string; startedAt: number; cancel: () => void };
const empty: RequestActivity[] = [];
let active = empty;
const listeners = new Set<() => void>();
export const activityStore = { subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, snapshot: () => active, serverSnapshot: () => empty };
export function beginActivity(label: string, cancel: () => void) {
  if (typeof window === 'undefined') return () => {};
  const id = crypto.randomUUID();
  active = [...active, { id, label, startedAt: Date.now(), cancel }]; listeners.forEach(listener => listener());
  return () => { active = active.filter(item => item.id !== id); listeners.forEach(listener => listener()); };
}
export function requestLabel(path: string, input: unknown) {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  if (path.includes('project-recommendations')) return '正在匹配项目并整理表述';
  if (path.includes('documents/read')) return '正在识别文档文字';
  if (path.includes('sources/extract')) return '正在读取网页内容';
  if (path.includes('jobs/classify')) return '正在整理岗位类别';
  const labels: Record<string, string> = { projects: '正在整理项目事实', preparation: '正在生成岗位准备卡', compare: '正在比较岗位', company: '正在分析公司资料' };
  if (value.action === 'exercise') return value.mode === 'interview' ? '正在准备面试题' : '正在准备工作任务';
  if (value.action === 'interview') return value.stage === 'review' ? '正在整理面试复盘' : '正在阅读回答并准备追问';
  if (value.action === 'scenario') return value.stage === 'review' ? '正在整理工作复盘' : '正在根据你的回应整理反馈';
  return labels[String(value.action)] || '正在处理内容';
}

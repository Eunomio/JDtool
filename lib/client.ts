import type { Job, Project } from './database';
import { accountRequestHeaders } from './database';
import { beginActivity, requestLabel } from './request-activity';

export async function api<T>(path: string, input: unknown, options: { signal?: AbortSignal } = {}): Promise<T> {
  const controller = new AbortController();
  const finish = beginActivity(requestLabel(path, input), () => controller.abort());
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

export function inputVersion(job: Job, projects: Project[] = [], sources: { id: string; text: string }[] = []) {
  const value = JSON.stringify({ job: { title: job.title, company: job.company, content: job.content, requirements: job.requirements, responsibilities: job.responsibilities }, projects: projects.map((project) => ({ id: project.id, updatedAt: project.updatedAt })).sort((a, b) => a.id.localeCompare(b.id)), sources });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

export function displayText(value: string, project: Project) {
  if (project.visibility !== 'display') return value;
  return redactText(value, project.redactions);
}

export function displayProjectText(value: string, projects: Project[]) {
  return redactText(value, projects.filter((project) => project.visibility === 'display').flatMap((project) => project.redactions));
}

function redactText(value: string, rules: { from: string; to: string }[]) {
  const replacements = new Map(rules.filter((rule) => rule.from).map((rule) => [rule.from, rule.to || '已隐藏']));
  if (!replacements.size) return value;
  const protectedValues = new Set(replacements.values());
  const terms = [...new Set([...replacements.keys(), ...protectedValues])].sort((a, b) => b.length - a.length);
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return value.replace(new RegExp(pattern, 'g'), (match) => replacements.get(match) ?? match);
}

export function safeProject(project: Project) {
  return { ...project, name: displayText(project.name, project), role: displayText(project.role, project), problem: displayText(project.problem, project), actions: displayText(project.actions, project), methods: displayText(project.methods, project), results: displayText(project.results, project), facts: project.facts.map((fact) => ({ ...fact, text: displayText(fact.text, project), sourceText: displayText(fact.sourceText, project) })), sources: project.sources.map((source) => ({ ...source, label: displayText(source.label, project), text: displayText(source.text, project) })) };
}

export function modelProjects(projects: Project[]) {
  return projects.filter((project) => project.confirmed).map((project) => {
    const safe = safeProject(project);
    return { id: safe.id, name: safe.name, stage: safe.stage, role: safe.role, facts: safe.facts, confirmed: true, sourceLabels: safe.sources.map((source) => source.label) };
  });
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

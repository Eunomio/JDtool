import type { Job, Project } from './database';

export async function api<T>(path: string, input: unknown): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(180_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || '暂时无法完成，请重试。');
  return result as T;
}

export function inputVersion(job: Job, projects: Project[] = [], sources: { id: string; text: string }[] = []) {
  const value = JSON.stringify({ job: { title: job.title, company: job.company, content: job.content, requirements: job.requirements, responsibilities: job.responsibilities }, projects: projects.map((project) => ({ id: project.id, updatedAt: project.updatedAt })).sort((a, b) => a.id.localeCompare(b.id)), sources });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

export function displayText(value: string, project: Project) {
  if (project.visibility !== 'display') return value;
  return project.redactions.reduce((text, rule) => rule.from ? text.replaceAll(rule.from, rule.to || '已隐藏') : text, value);
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

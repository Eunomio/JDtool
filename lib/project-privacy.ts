import type { Project } from './database';

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

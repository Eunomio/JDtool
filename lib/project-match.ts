import type { Job, Project, Recommendation } from './database';

export type ProjectCoverage = { requirementId: string; kind: 'direct' | 'transferable'; factIds: string[] };
type CriteriaInput = { requirements?: { id: string; text: string; sourceText?: string }[]; responsibilities?: { id: string; text: string; sourceText?: string }[] };
export function jobCriteria(job: CriteriaInput) {
  const seen = new Set<string>();
  return [...(job.requirements || []), ...(job.responsibilities || [])].filter(item => item.id && !seen.has(item.id) && !!seen.add(item.id));
}
export function groundedCoverage(rows: ProjectCoverage[] | undefined, job: CriteriaInput, project: { facts: { id: string; text: string }[] }): ProjectCoverage[] {
  const allowed = new Set(jobCriteria(job).map(item => item.id)); const facts = new Set(project.facts.map(fact => fact.id)); const result = new Map<string, ProjectCoverage>();
  for (const row of rows || []) {
    const ids = [...new Set(row.factIds.filter(id => facts.has(id)))];
    if (!allowed.has(row.requirementId) || !ids.length || !['direct', 'transferable'].includes(row.kind)) continue;
    if (result.get(row.requirementId)?.kind !== 'direct') result.set(row.requirementId, { ...row, factIds: ids });
  }
  return [...result.values()];
}
export function projectMatch(job: Pick<Job, 'requirements' | 'responsibilities'>, recommendations: Recommendation[], projects: Project[]) {
  const criteria = jobCriteria(job); const rows = new Map<string, ProjectCoverage>(); let analyzed = false;
  for (const recommendation of recommendations) {
    const project = projects.find(item => item.id === recommendation.projectId);
    if (!project?.confirmed || !recommendation.coverage) continue;
    analyzed = true;
    for (const row of groundedCoverage(recommendation.coverage, job, project)) if (rows.get(row.requirementId)?.kind !== 'direct') rows.set(row.requirementId, row);
  }
  const direct = [...rows.values()].filter(row => row.kind === 'direct').length; const transferable = rows.size - direct;
  return { score: analyzed && criteria.length ? Math.round((direct + transferable * .5) / criteria.length * 100) : null, direct, transferable, missing: criteria.length - rows.size, total: criteria.length, criteria, coverage: rows };
}

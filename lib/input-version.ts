import type {Job,Project} from './database';

export function inputVersion(job: Job, projects: Project[] = [], sources: { id: string; text: string }[] = []) {
  const value = JSON.stringify({ job: { title: job.title, company: job.company, content: job.content, requirements: job.requirements, responsibilities: job.responsibilities }, projects: projects.map((project) => ({ id: project.id, updatedAt: project.updatedAt })).sort((a, b) => a.id.localeCompare(b.id)), sources });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

import { z } from 'zod';
import { database, statuses, projectStages } from './database';
import { discardTaskChanges } from './task-storage';
import { storedClassificationSchema, roleCategoryIdSchema } from './classification-schema';
import { normalizeHiringType } from './job-normalization';

const id = z.string().min(1).max(300);
const text = z.string();
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)), '日期无效');
const url = z.string().refine((value) => !value || /^https?:\/\//i.test(value) && URL.canParse(value), '链接无效');
const ids = z.array(id);
const source = z.object({ id, jobId: id.optional(), label: text, url, text, collectedAt: date, kind: z.enum(['web', 'snippet']).optional(), publishedAt: text.optional() });
const reference = z.object({ id, text, sourceText: text });
const fact = reference.extend({ category: text });
const advice = z.object({ text, reason: text, example: text.optional(), requirementIds: ids, factIds: ids, sourceIds: ids, sourceQuotes: z.array(z.object({ sourceId: id, quote: text })).optional() });
const bullet = z.object({ text, factIds: ids, adopted: z.boolean().optional() });
const recommendation = z.object({ recommendations: z.array(z.object({ projectId: id, rank: z.number().int().positive(), role: z.enum(['primary', 'supporting']), matchType: z.enum(['direct', 'transferable', 'needs_more']), requirementIds: ids, factIds: ids, reason: text, resumeBullets: z.array(bullet), interviewOutline: z.array(bullet) })), gaps: z.array(advice), needsReview: z.array(text) });
const preparation = z.object({ priorities: z.array(advice), strengths: z.array(advice), gaps: z.array(advice), companyResearch: z.array(advice) });
const company = z.object({ facts: z.array(advice), hypotheses: z.array(advice), questions: z.array(advice), businesses: z.array(advice).optional(), roleInsights: z.array(advice).optional(), research: z.object({ company: text, summary: text, identityNote: text, queries: z.array(text), searchedAt: date }).optional() });
const comparison = z.object({ common: z.array(advice), differences: z.array(z.object({ jobId: id, uniqueRequirements: z.array(advice), projects: z.array(advice), preparation: z.array(advice) })), reusable: z.array(advice) });
const feedback = z.object({ strengths: z.array(text), dimensions: z.array(z.object({ name: text, feedback: text, requirementIds: ids })), improvements: z.array(text), outline: z.array(text), nextActions: z.array(text) });
const exercise = z.object({ id, direction: text, background: text, question: text, dimensions: z.array(text), followupDirections: z.array(text), nodes: z.array(z.object({ title: text, situation: text, colleague: text, choices: z.array(text).min(2), change: text })).refine(nodes => nodes.length === 0 || nodes.length === 2, '练习任务数量无效') });
const saved = { id, jobId: id, inputVersion: text, projectVersions: z.array(z.object({ id, updatedAt: date })).optional(), createdAt: date };
const job = z.object({
  id, title: text, company: text, content: text, sourceUrl: url.optional(), sourceType: z.enum(['link', 'images', 'text']).optional(),
  images: z.array(z.object({ name: text, dataUrl: z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/) })).max(3).optional(),
  location: text.optional(), direction: text.optional(), hiringType: text.transform(normalizeHiringType).optional(), responsibilities: z.array(reference).optional(), requirements: z.array(reference).optional(),
  classification: storedClassificationSchema.optional(), categoryOverride: roleCategoryIdSchema.optional(),
  warnings: z.array(text).optional(), parsedAt: date.optional(), sample: z.boolean().optional(), applicationDate: text.optional(), interviewDate: text.optional(), endReason: text.optional(),
  statusHistory: z.array(z.object({ status: z.enum(statuses), at: date })).optional(), status: z.enum(statuses), nextAction: text, createdAt: date, updatedAt: date,
});
const project = z.object({ id, name: text, type: text, stage: z.enum(projectStages), timeline: text, role: text, problem: text, actions: text, methods: text, results: text, skills: z.array(text), facts: z.array(fact), sources: z.array(source), confirmed: z.boolean(), sample: z.boolean().optional(), visibility: z.enum(['private', 'display']), redactions: z.array(z.object({ from: text, to: text })), updatedAt: date });
const backupSchema = z.object({
  format: z.literal('jdtool-backup'), version: z.union([z.literal(1), z.literal(2)]), exportedAt: date.optional(), jobs: z.array(job),
  projects: z.array(project).default([]), sources: z.array(source).default([]),
  recommendations: z.array(z.object({ ...saved, data: recommendation })).default([]), preparations: z.array(z.object({ ...saved, data: preparation })).default([]),
  companies: z.array(z.object({ ...saved, data: company })).default([]), comparisons: z.array(z.object({ ...saved, data: comparison })).default([]),
  tasks: z.array(z.object({ id, text, jobIds: ids.min(1), done: z.boolean(), order: z.number().finite(), createdAt: date })).default([]),
  practice: z.array(z.object({ id, jobId: id, type: z.enum(['interview', 'scenario']), inputVersion: text, updatedAt: date, data: z.object({
    exercise: exercise.optional(), answer: text, followup: text, supplement: text, feedback: feedback.nullable(), node: z.number().int().min(0).max(1),
    moves: z.array(z.object({ node: z.number().int().min(0).max(1), action: text, dialogue: text, consequence: text })), choice: text, question: text,
    response: z.object({ dialogue: text, consequence: text, feedback: feedback.nullable().optional() }).nullable(),
  }) })).default([]),
});
export type Backup = z.infer<typeof backupSchema>;
const tables = ['jobs', 'projects', 'sources', 'recommendations', 'preparations', 'companies', 'comparisons', 'tasks', 'practice'] as const;

function unique(values: string[]) { return new Set(values).size === values.length; }

export function parseBackup(value: unknown): Backup {
  const result = backupSchema.safeParse(value);
  if (!result.success) throw new Error('备份中的资料格式有误，现有资料未被修改。请选择完整备份。');
  const data = result.data;
  if (data.practice.some(record => record.type === 'scenario' && record.data.exercise && record.data.exercise.nodes.length !== 2)) throw new Error('备份中的岗位体验任务不完整，现有资料未被修改。');
  for (const table of tables) if (!unique(data[table].map((record) => record.id))) throw new Error('备份包含重复的记录编号，现有资料未被修改。');
  if (!unique(data.projects.flatMap((project) => project.facts.map((fact) => fact.id))) || !unique(data.jobs.flatMap((job) => [...(job.requirements || []), ...(job.responsibilities || [])].map((item) => item.id)))) throw new Error('备份中的事实编号有重复，现有资料未被修改。');
  return data;
}

export async function restoreBackup(data: Backup) {
  await database.transaction('rw', database.tables, async () => {
    const jobs = new Set([...(await database.jobs.toArray()), ...data.jobs].map((job) => job.id));
    for (const table of ['sources', 'recommendations', 'preparations', 'companies', 'practice'] as const) for (const record of data[table]) if (record.jobId && !jobs.has(record.jobId)) throw new Error('备份缺少关联岗位，现有资料未被修改。');
    for (const record of data.comparisons) if (record.jobId.split('|').some((id) => !jobs.has(id)) || record.data.differences.some((item) => !jobs.has(item.jobId))) throw new Error('备份缺少比较所需岗位，现有资料未被修改。');
    for (const task of data.tasks) if (task.jobIds.some((id) => !jobs.has(id))) throw new Error('备份缺少计划关联的岗位，现有资料未被修改。');
    const projects = new Map([...(await database.projects.toArray()), ...data.projects].map((project) => [project.id, project]));
    const replaced = new Set(data.projects.map((project) => project.id));
    await database.recommendations.toCollection().modify((record) => {
      for (const item of record.data.recommendations) if (replaced.has(item.projectId)) for (const bullet of [...item.resumeBullets, ...item.interviewOutline]) bullet.adopted = false;
    });
    for (const record of data.recommendations) for (const item of record.data.recommendations) {
      const project = projects.get(item.projectId);
      for (const bullet of [...item.resumeBullets, ...item.interviewOutline]) if (!project?.confirmed || !bullet.factIds.length || !bullet.factIds.every((id) => project.facts.some((fact) => fact.id === id))) bullet.adopted = false;
    }
    for (const table of tables) if (data[table].length) await database.table(table).bulkPut(data[table]);
  });
  discardTaskChanges(data.tasks.map((task) => task.id));
}

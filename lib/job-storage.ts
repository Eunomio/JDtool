import { database, type CompanyResult, type CompareResult, type Job, type PracticeSession, type PreparationResult, type RecommendationResult, type SavedResult, type Source, type Task } from './database';
import { adviceTexts, projectDeletionVersion } from './project-storage';
import { discardPracticeDrafts } from './practice-drafts';

export type DeletedJob = { job: Job; projectDeletionVersion: string | null; sources: Source[]; recommendations: SavedResult<RecommendationResult>[]; preparations: SavedResult<PreparationResult>[]; companies: SavedResult<CompanyResult>[]; practice: PracticeSession[]; tasks: Task[]; comparisons: SavedResult<CompareResult>[] };

async function syncNextAction(job: Job, text: string, recovering = false) {
  const tasks = await database.tasks.toArray();
  const linked = tasks.find(task => task.id === job.nextActionTaskId && task.jobIds.length === 1 && task.jobIds[0] === job.id);
  if (!text) { if (linked?.origin === 'job-next-action' && !linked.done) await database.tasks.delete(linked.id);return undefined; }
  if (linked && job.nextAction.trim() === text) return linked.id;
  if (linked?.origin === 'job-next-action' && !linked.done) { await database.tasks.update(linked.id, { text });return linked.id; }
  const duplicate = tasks.find(task => !task.done && task.text === text && task.jobIds.length === 1 && task.jobIds[0] === job.id);
  if (duplicate) return duplicate.id;
  let hash = 2166136261;for (let index = 0;index < job.id.length;index++) hash = Math.imul(hash ^ job.id.charCodeAt(index),16777619);
  const recoveryId = recovering ? `job-action-${job.id.slice(0,220)}-${(hash >>> 0).toString(16)}` : undefined;
  const task: Task = { id: recoveryId || crypto.randomUUID(), text, jobIds: [job.id], done: false, order: tasks.length ? Math.max(...tasks.map(item => item.order)) + 1 : 0, createdAt: recovering ? job.updatedAt : new Date().toISOString(), origin: 'job-next-action' };
  await database.tasks.put(task);return task.id;
}

export async function saveJobChanges(id: string, change: Partial<Job>) {
  await database.transaction('rw', database.jobs, database.tasks, async () => {
    const job = await database.jobs.get(id);if (!job) throw Error('这个岗位已移除，请刷新后再试。');
    const next = { ...change, updatedAt: new Date().toISOString() };
    if (change.nextAction !== undefined) { next.nextAction = change.nextAction.trim().slice(0,300);next.nextActionTaskId = await syncNextAction(job, next.nextAction); }
    await database.jobs.update(id, next);
  });
}

export async function recoverJobNextActions() {
  await database.transaction('rw', database.jobs, database.tasks, async () => {
    for (const job of await database.jobs.toArray()) if (job.nextAction.trim() && !job.nextActionTaskId) await database.jobs.update(job.id, { nextActionTaskId: await syncNextAction(job, job.nextAction.trim(), true) });
  });
}

export async function deleteJob(job: Job): Promise<DeletedJob> {
  const removed = await database.transaction('rw', database.tables, async () => {
    const bundle: DeletedJob = {
      job, projectDeletionVersion: projectDeletionVersion(), sources: await database.sources.where('jobId').equals(job.id).toArray(),
      recommendations: await database.recommendations.where('jobId').equals(job.id).toArray(),
      preparations: await database.preparations.where('jobId').equals(job.id).toArray(),
      companies: await database.companies.where('jobId').equals(job.id).toArray(),
      practice: await database.practice.where('jobId').equals(job.id).toArray(),
      tasks: (await database.tasks.toArray()).filter((task) => task.jobIds.includes(job.id)),
      comparisons: (await database.comparisons.toArray()).filter((result) => result.jobId.split('|').includes(job.id)),
    };
    await database.jobs.delete(job.id);
    for (const table of [database.sources, database.recommendations, database.preparations, database.companies, database.practice]) await table.where('jobId').equals(job.id).delete();
    await database.comparisons.bulkDelete(bundle.comparisons.map((item) => item.id));
    for (const task of bundle.tasks) {
      const jobIds = task.jobIds.filter((id) => id !== job.id);
      if (jobIds.length) await database.tasks.update(task.id, { jobIds });
      else await database.tasks.delete(task.id);
    }
    return bundle;
  });
  discardPracticeDrafts(database.accountId, [`interview-${job.id}`, `scenario-${job.id}`]);
  return removed;
}

export async function restoreJob(bundle: DeletedJob) {
  await database.transaction('rw', database.tables, async () => {
    const projectDataUnchanged = bundle.projectDeletionVersion === projectDeletionVersion();
    const removedTasks = projectDataUnchanged ? new Set<string>() : adviceTexts([bundle.preparations, bundle.comparisons]);
    await database.jobs.put(bundle.job);
    await database.sources.bulkPut(bundle.sources);
    if (projectDataUnchanged) {
      await database.recommendations.bulkPut(bundle.recommendations);
      await database.preparations.bulkPut(bundle.preparations);
      await database.comparisons.bulkPut(bundle.comparisons);
    }
    await database.companies.bulkPut(bundle.companies);
    await database.practice.bulkPut(bundle.practice);
    for (const task of bundle.tasks) {
      if (removedTasks.has(task.text)) continue;
      const current = await database.tasks.get(task.id);
      await database.tasks.put(current ? { ...current, jobIds: [...new Set([...current.jobIds, bundle.job.id])] } : task);
    }
  });
}

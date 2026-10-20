import { database, type CompanyResult, type CompareResult, type Job, type PracticeSession, type PreparationResult, type RecommendationResult, type SavedResult, type Source, type Task } from './database';

export type DeletedJob = { job: Job; sources: Source[]; recommendations: SavedResult<RecommendationResult>[]; preparations: SavedResult<PreparationResult>[]; companies: SavedResult<CompanyResult>[]; practice: PracticeSession[]; tasks: Task[]; comparisons: SavedResult<CompareResult>[] };

export async function deleteJob(job: Job): Promise<DeletedJob> {
  return database.transaction('rw', database.tables, async () => {
    const bundle: DeletedJob = {
      job, sources: await database.sources.where('jobId').equals(job.id).toArray(),
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
}

export async function restoreJob(bundle: DeletedJob) {
  await database.transaction('rw', database.tables, async () => {
    await database.jobs.put(bundle.job);
    await database.sources.bulkPut(bundle.sources);
    await database.recommendations.bulkPut(bundle.recommendations);
    await database.preparations.bulkPut(bundle.preparations);
    await database.companies.bulkPut(bundle.companies);
    await database.practice.bulkPut(bundle.practice);
    await database.comparisons.bulkPut(bundle.comparisons);
    for (const task of bundle.tasks) {
      const current = await database.tasks.get(task.id);
      await database.tasks.put(current ? { ...current, jobIds: [...new Set([...current.jobIds, bundle.job.id])] } : task);
    }
  });
}

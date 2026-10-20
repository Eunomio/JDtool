import { z } from 'zod';
import { database, type Job } from './database';
import { storedClassificationSchema } from './classification-schema';
import { roleInputVersion } from './role-taxonomy';
import { normalizeHiringType } from './job-normalization';

export const classificationState = (job: Pick<Job, 'classification' | 'categoryOverride'>) => JSON.stringify([job.classification, job.categoryOverride]);
export const needsRoleClassification = (job: Job) => !job.categoryOverride && job.content.trim().length >= 15 && job.classification?.inputVersion !== roleInputVersion(job);

export async function normalizeStoredHiringTypes() {
  await database.jobs.filter(job => job.hiringType !== undefined && job.hiringType !== normalizeHiringType(job.hiringType)).modify(job => {
    job.hiringType = normalizeHiringType(job.hiringType!);
  });
}

const responseSchema = z.object({ classifications: z.array(z.object({ jobId: z.string(), classification: storedClassificationSchema })).max(6) });

export async function classifyAndSaveJobs(snapshots: Job[], signal: AbortSignal, force = false) {
  signal.throwIfAborted();
  const latest = await database.jobs.bulkGet(snapshots.map(job => job.id));
  const batch = latest.filter((job): job is Job => !!job && snapshots.some(snapshot => snapshot.id === job.id && roleInputVersion(snapshot) === roleInputVersion(job) && classificationState(snapshot) === classificationState(job)) && (force || needsRoleClassification(job)));
  if (!batch.length) return { saved: 0, missing: 0 };
  const response = await fetch('/api/jobs/classify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(150000)]),
    body: JSON.stringify({ jobs: batch.map(job => ({ id: job.id, title: job.title, content: job.content, responsibilities: job.responsibilities, requirements: job.requirements })) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error('部分岗位还未完成归类，可稍后重试。');
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) throw new Error('这次归类尚未完成，可稍后重试。');
  signal.throwIfAborted();
  return database.transaction('rw', database.jobs, async () => {
    let saved = 0; let missing = 0;
    for (const snapshot of batch) {
      signal.throwIfAborted();
      const matches = parsed.data.classifications.filter(row => row.jobId === snapshot.id && row.classification.inputVersion === roleInputVersion(snapshot));
      if (matches.length !== 1) { missing++; continue; }
      const current = await database.jobs.get(snapshot.id);
      // Another tab may have edited, removed or manually regrouped this job during analysis.
      if (!current || roleInputVersion(current) !== roleInputVersion(snapshot) || classificationState(current) !== classificationState(snapshot)) continue;
      const next = { ...current, classification: matches[0].classification };
      if (force) delete next.categoryOverride;
      await database.jobs.put(next); saved++;
    }
    return { saved, missing };
  });
}

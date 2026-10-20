import { database, accountStorageKey, type Project, type RecommendationResult, type SavedResult } from './database';

export function projectDeletionVersion() { return localStorage.getItem(accountStorageKey('jdtool-projects-deleted')); }

export function adviceTexts(values: unknown[]) {
  const texts = new Set<string>();
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const object = value as Record<string, unknown>;
    if (typeof object.text === 'string') texts.add(object.text);
    Object.values(object).forEach(collect);
  }
  collect(values);
  return texts;
}

export async function saveProject(project: Project) {
  await database.transaction('rw', database.projects, database.recommendations, async () => {
    const previous = await database.projects.get(project.id);
    await database.projects.put(project);
    if (previous) await database.recommendations.toCollection().modify((record) => {
      for (const recommendation of record.data.recommendations) if (recommendation.projectId === project.id) {
        for (const bullet of [...recommendation.resumeBullets, ...recommendation.interviewOutline]) bullet.adopted = false;
      }
    });
  });
}

// Generated records used the whole confirmed project library, including uncited facts.
export async function deleteProjects(projectId?: string) {
  // Invalidate undo copies in other tabs before their queued writes can restore data.
  localStorage.setItem(accountStorageKey('jdtool-projects-deleted'), crypto.randomUUID());
  await database.transaction('rw', database.tables, async () => {
    const existing = new Set((await database.projects.toArray()).map((project) => project.id));
    const affected = (record: { projectVersions?: { id: string }[] }) => !projectId || !record.projectVersions || record.projectVersions.some((project) => project.id === projectId || !existing.has(project.id));
    const recommendations = (await database.recommendations.toArray()).filter((record) => affected(record) || record.data.recommendations.some((item) => item.projectId === projectId));
    const preparations = (await database.preparations.toArray()).filter(affected);
    const comparisons = (await database.comparisons.toArray()).filter(affected);
    const texts = adviceTexts([preparations, comparisons]);
    if (projectId) await database.projects.delete(projectId);
    else await database.projects.clear();
    await database.recommendations.bulkDelete(recommendations.map((record) => record.id));
    await database.preparations.bulkDelete(preparations.map((record) => record.id));
    await database.comparisons.bulkDelete(comparisons.map((record) => record.id));
    await database.tasks.filter((task) => texts.has(task.text)).delete();
  });
}

export async function saveProjectResult(table: 'recommendations' | 'preparations' | 'comparisons', result: { id: string; jobId: string; inputVersion: string; createdAt: string; data: unknown }, projects: Project[]) {
  await database.transaction('rw', database.projects, database.jobs, database[table], async () => {
    for (const id of result.jobId.split('|')) if (!await database.jobs.get(id)) throw new Error('岗位已删除，本次结果未保存。');
    for (const project of projects.filter((project) => project.confirmed)) {
      const current = await database.projects.get(project.id);
      if (!current?.confirmed || current.updatedAt !== project.updatedAt) throw new Error('项目资料已更新，请按最新事实重新生成。');
    }
    // Each table's result shape is checked by its API before reaching this shared write.
    await database.table(table).put({ ...result, projectVersions: projects.filter((project) => project.confirmed).map(({ id, updatedAt }) => ({ id, updatedAt })) });
  });
}

export async function updateRecommendationBullet(recordId: string, project: Project, key: 'resumeBullets' | 'interviewOutline', index: number, change: { text?: string; adopted?: boolean }): Promise<SavedResult<RecommendationResult>> {
  return database.transaction('rw', database.projects, database.recommendations, async () => {
    const current = await database.projects.get(project.id);
    const record = await database.recommendations.get(recordId);
    if (!record || !current || current.updatedAt !== project.updatedAt) throw new Error('项目资料已更新，请重新打开并核对表述。');
    const bullet = record.data.recommendations.find((item) => item.projectId === project.id)?.[key][index];
    if (!bullet) throw new Error('这条表述已更新，请重新打开后修改。');
    if (change.adopted && (!current.confirmed || !bullet.factIds.length || !bullet.factIds.every((id) => current.facts.some((fact) => fact.id === id)))) throw new Error('原始事实已变化，请重新生成后核对。');
    Object.assign(bullet, change);
    if (change.text !== undefined) bullet.adopted = false;
    await database.recommendations.put(record);
    return record;
  });
}

import { parseBackup, restoreBackup, type Backup } from './backup';
import { adviceTexts } from './project-storage';
import { emptyWorkspace, workspaceTables, type WorkspaceData } from './workspace-data';

export async function readLegacyData(): Promise<WorkspaceData | null> {
  if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some(item => item.name === 'jdtool')) return null;
  const db = await new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open('jdtool');
    request.onupgradeneeded = event => { if (event.oldVersion === 0) request.transaction?.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => request.error?.name === 'AbortError' ? resolve(null) : reject(request.error);
  });
  if (!db) return null;
  try {
    const data = emptyWorkspace();
    for (const table of workspaceTables) if (db.objectStoreNames.contains(table)) {
      (data as unknown as Record<string, unknown>)[table] = await new Promise((resolve, reject) => { const request = db.transaction(table).objectStore(table).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    }
    if (!workspaceTables.some(table => data[table].length)) return null;
    const validated = parseBackup({ format: 'jdtool-backup', version: 2, ...data });
    return Object.fromEntries(workspaceTables.map(table => [table, validated[table]])) as WorkspaceData;
  } finally { db.close(); }
}

export function personalLegacyData(original: WorkspaceData): WorkspaceData {
  const data = structuredClone(original);
  data.jobs = data.jobs.filter(row => !row.sample && !row.id.startsWith('sample-'));
  data.projects = data.projects.filter(row => !row.sample && !row.id.startsWith('sample-'));
  const jobs = new Set(data.jobs.map(row => row.id)); const projects = new Set(data.projects.map(row => row.id));
  data.sources = data.sources.filter(row => !row.jobId || jobs.has(row.jobId));
  data.companies = data.companies.filter(row => jobs.has(row.jobId));
  data.practice = data.practice.filter(row => jobs.has(row.jobId));
  const removedProjects = original.projects.length !== data.projects.length;
  const validVersions = (row: { projectVersions?: { id: string }[] }) => row.projectVersions ? row.projectVersions.every(project => projects.has(project.id)) : !removedProjects;
  data.recommendations = data.recommendations.filter(row => jobs.has(row.jobId) && validVersions(row) && row.data.recommendations.every(item => projects.has(item.projectId)));
  data.preparations = data.preparations.filter(row => jobs.has(row.jobId) && validVersions(row));
  data.comparisons = data.comparisons.filter(row => row.jobId.split('|').every(id => jobs.has(id)) && validVersions(row));
  const removedAdvice = adviceTexts([original.preparations.filter(row => !data.preparations.some(item => item.id === row.id)), original.comparisons.filter(row => !data.comparisons.some(item => item.id === row.id))]);
  data.tasks = data.tasks.map(row => ({ ...row, jobIds: row.jobIds.filter(id => jobs.has(id)) })).filter(row => row.jobIds.length && !removedAdvice.has(row.text));
  return data;
}
export async function importLegacyData(data: WorkspaceData) { await restoreBackup(parseBackup({ format: 'jdtool-backup', version: 2, ...data })); }
export function downloadLegacyData(data: WorkspaceData) {
  const backup: Backup = { format: 'jdtool-backup', version: 2, ...data };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '旧版求职准备资料备份.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

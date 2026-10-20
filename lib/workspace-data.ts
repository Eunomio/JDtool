import type { Backup } from './backup';

export const workspaceTables = ['jobs', 'projects', 'sources', 'recommendations', 'preparations', 'companies', 'comparisons', 'tasks', 'practice'] as const;
export type WorkspaceTable = typeof workspaceTables[number];
export type WorkspaceData = Pick<Backup, WorkspaceTable>;
export type WorkspaceRow = { id: string; [key: string]: unknown };
export type WorkspaceChange = { table: WorkspaceTable; id: string; before: WorkspaceRow | null; after: WorkspaceRow | null };
export type WorkspaceSnapshot = { revision: number; data: WorkspaceData };
export type SyncState = WorkspaceSnapshot & { id: 'account'; pending?: { requestId: string; revision: number; changes: WorkspaceChange[] } };

export function emptyWorkspace(): WorkspaceData {
  return Object.fromEntries(workspaceTables.map(table => [table, []])) as unknown as WorkspaceData;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export const sameData = (left: unknown, right: unknown) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
export const workspaceRows = (data: WorkspaceData, table: WorkspaceTable) => data[table] as unknown as WorkspaceRow[];

export function workspaceChanges(before: WorkspaceData, after: WorkspaceData): WorkspaceChange[] {
  return workspaceTables.flatMap(table => {
    const old = new Map(workspaceRows(before, table).map(row => [row.id, row]));
    const next = new Map(workspaceRows(after, table).map(row => [row.id, row]));
    return [...new Set([...old.keys(), ...next.keys()])].flatMap(id => sameData(old.get(id), next.get(id)) ? [] : [{ table, id, before: old.get(id) || null, after: next.get(id) || null }]);
  });
}

export class WorkspaceConflict extends Error {
  constructor() { super('这些资料已在其他页面修改。请先导出本页资料，再重新读取账号中的资料。'); }
}

export function applyWorkspaceChanges(current: WorkspaceData, changes: WorkspaceChange[]): WorkspaceData {
  const result = structuredClone(current);
  for (const change of changes) {
    const rows = workspaceRows(result, change.table);
    const index = rows.findIndex(row => row.id === change.id);
    const remote = rows[index]; const { before, after } = change;
    if (after && after.id !== change.id || before && before.id !== change.id) throw new WorkspaceConflict();
    if (!after) {
      if (remote && !sameData(remote, before)) throw new WorkspaceConflict();
      if (index >= 0) rows.splice(index, 1);
    } else if (!before) {
      if (remote && !sameData(remote, after)) throw new WorkspaceConflict();
      if (!remote) rows.push(structuredClone(after));
    } else {
      if (!remote) throw new WorkspaceConflict();
      const merged = { ...remote };
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new WorkspaceConflict();
        if (sameData(before[key], after[key])) continue;
        if (key === 'updatedAt' && typeof remote[key] === 'string' && typeof after[key] === 'string') merged[key] = [remote[key], after[key]].sort().at(-1);
        else {
          if (!sameData(remote[key], before[key]) && !sameData(remote[key], after[key])) throw new WorkspaceConflict();
          if (after[key] === undefined) delete merged[key]; else merged[key] = structuredClone(after[key]);
        }
      }
      rows[index] = merged;
    }
  }
  return result;
}

export function mergeWorkspace(base: WorkspaceData, local: WorkspaceData, remote: WorkspaceData) {
  return applyWorkspaceChanges(remote, workspaceChanges(base, local));
}

export function hasDemoData(data: WorkspaceData) {
  return [...data.jobs, ...data.projects].some(row => row.sample || row.id.startsWith('sample-'));
}

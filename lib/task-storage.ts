import { database } from './database';

const prefix = 'jdtool-task-change:';
type Change = { id: string; done: boolean; token: string };

async function applyChange(key: string, raw: string) {
  const change = JSON.parse(raw) as Change;
  if (typeof change.id !== 'string' || typeof change.done !== 'boolean' || typeof change.token !== 'string' || key !== prefix + change.id) throw new Error('暂存的任务更改无法读取。');
  await database.transaction('rw', database.tasks, async () => {
    if (localStorage.getItem(key) === raw) await database.tasks.update(change.id, { done: change.done });
  });
  if (localStorage.getItem(key) === raw) localStorage.removeItem(key);
}

export function saveTaskDone(id: string, done: boolean): Promise<void> {
  const key = prefix + id;
  const raw = JSON.stringify({ id, done, token: crypto.randomUUID() });
  // Write before showing the new checkmark so reload can replay an unfinished write.
  localStorage.setItem(key, raw);
  return applyChange(key, raw);
}

export async function recoverTaskChanges() {
  const keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
  for (const key of keys) { const raw = localStorage.getItem(key); if (raw) await applyChange(key, raw); }
}

export function discardTaskChanges(ids: string[]) {
  for (const id of ids) localStorage.removeItem(prefix + id);
}

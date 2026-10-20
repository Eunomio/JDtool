import { liveQuery, type Subscription } from 'dexie';
import { database, selectAccountDatabase, type JobDatabase } from './database';
import type { AccountUser } from './account-types';
import { parseBackup } from './backup';
import { applyWorkspaceChanges, emptyWorkspace, mergeWorkspace, workspaceChanges, workspaceRows, workspaceTables, WorkspaceConflict, type SyncState, type WorkspaceData, type WorkspaceSnapshot } from './workspace-data';

export type SaveStatus = { state: 'saved' | 'saving' | 'error' | 'conflict'; message: string };
export async function readWorkspace(db = database): Promise<WorkspaceData> {
  return db.transaction('r', workspaceTables.map(name => db.table(name)), async () => Object.fromEntries(await Promise.all(workspaceTables.map(async table => [table, await db.table(table).toArray()]))) as unknown as WorkspaceData);
}
async function applyData(db: JobDatabase, before: WorkspaceData, after: WorkspaceData) {
  for (const change of workspaceChanges(before, after)) {
    if (change.after) await db.table(change.table).put(change.after); else await db.table(change.table).delete(change.id);
  }
}
class AccountRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function validatedSnapshot(value: unknown): WorkspaceSnapshot {
  const result = value as WorkspaceSnapshot;
  if (!Number.isSafeInteger(result.revision) || result.revision < 0 || !result.data) throw new Error('账号资料暂时无法读取。');
  const parsed = parseBackup({ ...result.data, format: 'jdtool-backup', version: 2 });
  return { revision: result.revision, data: Object.fromEntries(workspaceTables.map(table => [table, parsed[table]])) as WorkspaceData };
}

export class AccountSync {
  readonly db: JobDatabase;
  private status: SaveStatus = { state: 'saved', message: '' };
  private listeners = new Set<() => void>();
  private subscription?: Subscription;
  private timer?: ReturnType<typeof setTimeout>;
  private interval?: ReturnType<typeof setInterval>;
  private operation?: Promise<void>;
  private stopped = false;
  private latest?: { data: WorkspaceData; meta?: SyncState };
  private remote?: WorkspaceSnapshot;
  constructor(readonly user: AccountUser) { this.db = selectAccountDatabase(user.id, user.role); }
  getStatus = () => this.status;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private setStatus(state: SaveStatus['state'], message = '') { this.status = { state, message }; this.listeners.forEach(listener => listener()); }
  private async request(body?: unknown) {
    let response: Response;
    try { response = await fetch('/api/workspace', { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Account-Id': this.user.id, ...(!body && this.remote ? { 'If-None-Match': `"${this.remote.revision}"` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('暂时无法保存到账号，资料仍保留在此浏览器。请稍后重试。'); }
    if (response.status === 304 && this.remote) return this.remote;
    const result = await response.json().catch(() => { throw new Error('暂时无法保存到账号，资料仍保留在此浏览器。请稍后重试。'); });
    if (!response.ok) {
      if (response.status === 401) window.dispatchEvent(new Event('jdtool-account-changed'));
      throw new AccountRequestError(response.status, result.error?.message || '暂时无法保存资料，请重试。');
    }
    this.remote = validatedSnapshot(result); return this.remote;
  }
  private async inspect() {
    return this.db.transaction('r', this.db.tables, async () => ({ data: await readWorkspace(this.db), meta: await this.db.sync.get('account') }));
  }
  private async accept(remote: WorkspaceSnapshot, sent?: WorkspaceData, discard = false) {
    await this.db.transaction('rw', this.db.tables, async () => {
      const { data, meta } = await this.inspect();
      const base = sent || meta?.data || emptyWorkspace();
      const merged = discard ? remote.data : mergeWorkspace(base, data, remote.data);
      await applyData(this.db, data, merged);
      await this.db.sync.put({ id: 'account', ...remote });
    });
    window.dispatchEvent(new Event('jdtool-workspace-updated'));
  }
  private async withLock(action: () => Promise<void>): Promise<void> {
    if (navigator.locks) await navigator.locks.request(`jdtool-sync-${this.user.id}`, async () => { await action(); }); else await action();
  }
  async initialize() { await this.withLock(async () => { await this.accept(await this.request()); }); }
  start() {
    this.subscription = liveQuery(() => this.inspect()).subscribe({ next: value => {
      this.latest = value;
      if (value.meta?.pending || workspaceChanges(value.meta?.data || emptyWorkspace(), value.data).length) {
        this.setStatus('saving'); clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 150);
      }
    }, error: () => this.setStatus('error', '暂时无法保存资料，请重试。') });
    this.interval = setInterval(() => { if (document.visibilityState !== 'hidden') void this.flush(true).catch(() => {}); }, 15000);
    window.addEventListener('online', this.onFocus); window.addEventListener('focus', this.onFocus); window.addEventListener('pagehide', this.onPageHide);
  }
  private onFocus = () => { void this.flush(true).catch(() => {}); };
  private onPageHide = () => {
    const value = this.latest; if (!value?.meta) return;
    const changes = workspaceChanges(value.meta.data, value.data); if (!changes.length && !value.meta.pending) return;
    const body = JSON.stringify(value.meta.pending || { requestId: crypto.randomUUID(), revision: value.meta.revision, changes });
    if (new Blob([body]).size < 60000) void fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Account-Id': this.user.id }, body, keepalive: true }).catch(() => {});
  };
  async flush(pull = false): Promise<void> {
    if (this.stopped) return;
    if (this.operation) { await this.operation; return this.flush(pull); }
    this.operation = this.withLock(async () => {
      let { data, meta } = await this.inspect();
      if (!meta) throw new Error('账号资料暂未读取完成，请重试。');
      const changes = workspaceChanges(meta.data, data);
      if (!changes.length && !meta.pending) {
        if (pull) { const remote = await this.request(); if (remote.revision !== meta.revision) await this.accept(remote); }
        this.setStatus('saved'); return;
      }
      this.setStatus('saving');
      if (!meta.pending) {
        meta = { ...meta, pending: { requestId: crypto.randomUUID(), revision: meta.revision, changes } };
        await this.db.sync.put(meta);
      }
      const sent = applyWorkspaceChanges(meta.data, meta.pending!.changes);
      const remote = await this.request(meta.pending);
      await this.accept(remote, sent);
      this.setStatus('saved');
    });
    try { await this.operation; }
    catch (error) {
      const conflict = error instanceof WorkspaceConflict || error instanceof AccountRequestError && error.status === 409;
      this.setStatus(conflict ? 'conflict' : 'error', error instanceof Error && /^[\u4e00-\u9fff]/.test(error.message) ? error.message : '暂时无法保存资料，请重试。');
      throw error;
    } finally { this.operation = undefined; }
  }
  async reload() {
    if (this.operation) await this.operation.catch(() => {});
    await this.withLock(async () => this.accept(await this.request(), undefined, true)); this.setStatus('saved');
  }
  dispose() {
    this.stopped = true; this.subscription?.unsubscribe(); clearTimeout(this.timer); clearInterval(this.interval);
    window.removeEventListener('online', this.onFocus); window.removeEventListener('focus', this.onFocus); window.removeEventListener('pagehide', this.onPageHide);
  }
}

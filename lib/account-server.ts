import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash, scrypt as deriveKey, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';
import { accountCookie, type AccountUser } from './account-types';
import { emptyWorkspace } from './workspace-data';
import { sampleJobs, sampleProjects, sampleSources } from './samples';

const sessions = 7 * 24 * 60 * 60;
type AccountRow = AccountUser & { password: string };
type Store = { db: DatabaseSync; ready: Promise<void> };
const stores = new Map<string, Store>();

async function passwordHash(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = await new Promise<Buffer>((resolve, reject) => deriveKey(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
async function matchesPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = await passwordHash(password, salt);
  return timingSafeEqual(Buffer.from(computed.split(':')[2], 'hex'), Buffer.from(hash, 'hex'));
}

async function seedAccounts(db: DatabaseSync) {
  const accounts = [{ username: 'admin', password: 'admin', role: 'admin' }, ...Array.from({ length: 10 }, (_, index) => ({ username: `P${String(index + 1).padStart(2, '0')}`, password: '123456', role: 'member' }))];
  for (const account of accounts) {
    if (db.prepare('SELECT id FROM accounts WHERE username_key = ?').get(account.username.toLowerCase())) continue;
    const id = randomUUID(); const hash = await passwordHash(account.password);
    const data = account.role === 'admin' ? { ...emptyWorkspace(), jobs: sampleJobs(), projects: sampleProjects(), sources: sampleSources() } : emptyWorkspace();
    db.exec('BEGIN IMMEDIATE');
    try {
      const inserted = db.prepare('INSERT OR IGNORE INTO accounts (id, username, username_key, password, role) VALUES (?, ?, ?, ?, ?)').run(id, account.username, account.username.toLowerCase(), hash, account.role);
      if (inserted.changes) db.prepare('INSERT INTO workspaces (account_id, revision, data) VALUES (?, 0, ?)').run(id, JSON.stringify(data));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}

export async function accountStore() {
  const directory = resolve(/* turbopackIgnore: true */ process.env.APP_DATA_DIR || join(process.cwd(), '.local', 'accounts'));
  let store = stores.get(directory);
  if (!store) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(directory, 'accounts.sqlite');
    const db = new DatabaseSync(file, { timeout: 5000 }); chmodSync(file, 0o600);
    db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','member')));
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (account_id TEXT PRIMARY KEY REFERENCES accounts(id), revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS account_onboarding (account_id TEXT PRIMARY KEY REFERENCES accounts(id), first_seen_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('started','skipped','completed')), updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace_requests (account_id TEXT NOT NULL, request_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(account_id, request_id));`);
    store = { db, ready: seedAccounts(db) }; stores.set(directory, store);
  }
  await store.ready;
  return store.db;
}

const publicUser = ({ id, username, role }: AccountUser): AccountUser => ({ id, username, role });

export async function registerAccount(username: string, password: string) {
  const db = await accountStore(); const key = username.toLowerCase();
  if (db.prepare('SELECT id FROM accounts WHERE username_key = ?').get(key)) throw new AppError(409, 'USERNAME_TAKEN', '这个账号已被使用，请换一个。');
  const user: AccountUser = { id: randomUUID(), username, role: 'member' };
  const hash = await passwordHash(password);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO accounts (id, username, username_key, password, role) VALUES (?, ?, ?, ?, ?)').run(user.id, username, key, hash, user.role);
    db.prepare('INSERT INTO workspaces (account_id, revision, data) VALUES (?, 0, ?)').run(user.id, JSON.stringify(emptyWorkspace()));
    db.exec('COMMIT'); return user;
  } catch (error) {
    db.exec('ROLLBACK');
    if (db.prepare('SELECT id FROM accounts WHERE username_key = ?').get(key)) throw new AppError(409, 'USERNAME_TAKEN', '这个账号已被使用，请换一个。');
    throw error;
  }
}

export async function authenticateAccount(username: string, password: string) {
  const db = await accountStore();
  const row = db.prepare('SELECT id, username, password, role FROM accounts WHERE username_key = ?').get(username.toLowerCase()) as AccountRow | undefined;
  const hash = row?.password || (db.prepare("SELECT password FROM accounts WHERE username_key = 'admin'").get() as { password: string }).password;
  const valid = await matchesPassword(password, hash);
  if (!row || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', '账号或密码不正确，请重新输入。');
  return publicUser(row);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
function sessionToken(request: Request) { return request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(`${accountCookie}=`))?.slice(accountCookie.length + 1) || ''; }

export async function createSession(user: AccountUser) {
  const token = randomBytes(32).toString('hex'); const db = await accountStore();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(tokenHash(token), user.id, Date.now() + sessions * 1000);
  return token;
}
export async function currentUser(request: Request): Promise<AccountUser | null> {
  const token = sessionToken(request); if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = await accountStore();
  const row = db.prepare('SELECT a.id, a.username, a.role FROM sessions s JOIN accounts a ON s.account_id = a.id WHERE s.token_hash = ? AND s.expires_at > ?').get(tokenHash(token), Date.now()) as AccountUser | undefined;
  return row ? publicUser(row) : null;
}
export async function removeSession(request: Request) { (await accountStore()).prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(sessionToken(request))); }

export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError(403, 'INVALID_ORIGIN', '请在当前网页中操作。');
  if (!origin) return;
  const allowed = process.env.APP_ORIGIN;
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || new URL(request.url).host;
  if (allowed ? origin !== allowed : !URL.canParse(origin) || new URL(origin).host !== host) throw new AppError(403, 'INVALID_ORIGIN', '请在当前网页中操作。');
}
export async function requireUser(request: Request, bindAccount = false) {
  checkOrigin(request);
  const user = await currentUser(request);
  const expected = request.headers.get('x-account-id');
  if (!user || bindAccount && !expected || expected && expected !== user.id) throw new AppError(401, 'LOGIN_REQUIRED', '请重新登录后继续。');
  return user;
}

export function sessionCookieOptions(request: Request) {
  const secure = !!process.env.APP_ORIGIN?.startsWith('https://') || new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https';
  return { httpOnly: true, secure, sameSite: secure ? 'none' as const : 'lax' as const, partitioned: secure, path: '/', maxAge: sessions };
}

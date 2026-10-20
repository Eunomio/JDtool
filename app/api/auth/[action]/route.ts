import { z } from 'zod';
import { NextResponse } from 'next/server';
import { AppError, errorResponse, readJson } from '../../../../lib/errors';
import { authenticateAccount, checkOrigin, createSession, currentUser, registerAccount, removeSession, requireUser, sessionCookieOptions } from '../../../../lib/account-server';
import { accountCookie } from '../../../../lib/account-types';

export const runtime = 'nodejs';
const credentials = z.object({ username: z.string().min(1).max(32).regex(/^[a-zA-Z0-9]+$/), password: z.string().min(1).max(128) });
const failures = new Map<string, { count: number; until: number }>();
const registrations = new Map<string, { count: number; until: number }>();
const attemptsByIp = new Map<string, { count: number; until: number }>();
function reserve(map: typeof failures, key: string, maximum: number, duration: number) {
  const now = Date.now();
  if (map.size > 1000) for (const [key, value] of map) if (value.until < now) map.delete(key);
  let value = map.get(key);
  if (!value || value.until < now) { value = { count: 0, until: now + duration }; map.set(key, value); }
  if (value.count >= maximum) throw new AppError(429, 'AUTH_LIMIT', '尝试次数较多，请稍后再试。');
  return value;
}
type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request, context: Context) {
  try {
    if ((await context.params).action !== 'session') throw new AppError(404, 'NOT_FOUND', '页面不存在。');
    return NextResponse.json({ user: await currentUser(request) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    if (action === 'logout') {
      if (request.headers.has('x-account-id')) await requireUser(request, true);
      await removeSession(request);
      const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
      response.cookies.set(accountCookie, '', { ...sessionCookieOptions(request), maxAge: 0 });
      return response;
    }
    if (action !== 'login' && action !== 'register') throw new AppError(404, 'NOT_FOUND', '页面不存在。');
    const result = credentials.safeParse(await readJson(request, 2048));
    if (!result.success) throw new AppError(400, 'INVALID_CREDENTIALS_INPUT', '账号只能使用字母和数字，长度为1—32位；请填写密码。');
    const { username, password } = result.data;
    const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'anonymous').split(',')[0].trim();
    const key = `${ip}:${username.toLowerCase()}`;
    reserve(attemptsByIp, ip, 120, 60 * 1000).count++;
    const attempts = reserve(failures, key, 10, 10 * 60 * 1000);
    if (action === 'register') {
      if (password.length < 6) throw new AppError(400, 'SHORT_PASSWORD', '注册密码至少需要6位。');
      reserve(registrations, ip, 30, 60 * 1000).count++;
    }
    let user;
    try { user = action === 'register' ? await registerAccount(username, password) : await authenticateAccount(username, password); }
    catch (error) { if (action === 'login') attempts.count++; throw error; }
    failures.delete(key);
    await removeSession(request);
    const token = await createSession(user);
    const response = NextResponse.json({ user }, { status: action === 'register' ? 201 : 200, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(accountCookie, token, sessionCookieOptions(request));
    return response;
  } catch (error) { return errorResponse(error); }
}

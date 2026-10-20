'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { AccountUser } from '../lib/account-types';
import { AccountSync, readWorkspace } from '../lib/account-sync';
import { discardLegacyImports } from '../lib/legacy-cleanup';
import Workbench from './workbench';
import { Icon } from './ui';

const marker = 'jdtool-active-account';
function downloadData(data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = '求职准备资料备份.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function SignIn() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '暂时无法登录，请稍后重试。');
      localStorage.setItem(marker, result.user.id); window.location.replace('/');
    } catch (error) { setError(error instanceof Error && error.name === 'Error' ? error.message : '连接等待较久，请重试。'); setBusy(false); }
  }
  return <main className="account-page"><section className="account-intro"><div className="account-brand"><span className="brand-icon"><Icon name="layers" size={26} /></span><strong>岗位探索</strong></div><div className="account-intro-copy"><h1>把下一份机会，<br />准备得更好。</h1></div></section><section className="account-form-area"><div className="account-form-card"><h2>{mode === 'login' ? '欢迎回来' : '创建你的账号'}</h2><div className="account-tabs" role="tablist" aria-label="账号操作"><button role="tab" aria-selected={mode === 'login'} disabled={busy} onClick={() => { setMode('login'); setError(''); }}>登录</button><button role="tab" aria-selected={mode === 'register'} disabled={busy} onClick={() => { setMode('register'); setError(''); }}>注册</button></div>
    <form onSubmit={submit}><label htmlFor="account-username">账号</label><input id="account-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required pattern="[A-Za-z0-9]+" maxLength={32} value={username} onChange={event => setUsername(event.target.value)} disabled={busy} placeholder="输入账号" aria-describedby="account-username-hint" /><small id="account-username-hint">仅支持字母和数字，最多32位</small><label htmlFor="account-password">密码</label><div className="account-password"><input id="account-password" name="password" type={visible ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 6 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} placeholder={mode === 'register' ? '设置至少6位密码' : '输入密码'} /><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? '隐藏密码' : '显示密码'}>{visible ? '隐藏' : '显示'}</button></div>{error && <p className="notice error" role="alert">{error}</p>}<button className="primary account-submit" type="submit" disabled={busy}>{busy ? mode === 'login' ? '正在登录…' : '正在创建…' : mode === 'login' ? '登录并继续准备' : '注册并开始准备'}<Icon name="arrow" size={17} /></button></form></div></section></main>;
}

export default function AccountGate() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [sync, setSync] = useState<AccountSync | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let cancelled = false; let engine: AccountSync | undefined;
    const changed = () => window.location.reload();
    const storage = (event: StorageEvent) => { if (event.key === marker && event.newValue !== engine?.user.id) changed(); };
    window.addEventListener('jdtool-account-changed', changed); window.addEventListener('storage', storage);
    void (async () => {
      try {
        await discardLegacyImports().catch(() => {});
        const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('暂时无法读取账号，请重试。');
        const result = await response.json(); if (cancelled) return;
        setUser(result.user);
        if (result.user) {
          localStorage.setItem(marker, result.user.id); engine = new AccountSync(result.user);
          await engine.initialize(); if (cancelled) return;
          engine.start(); setSync(engine);
        }
      } catch (error) { if (!cancelled) setError(error instanceof Error && /^[\u4e00-\u9fff]/.test(error.message) ? error.message : '暂时无法读取账号，请重试。'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; engine?.dispose(); window.removeEventListener('jdtool-account-changed', changed); window.removeEventListener('storage', storage); };
  }, []);
  async function logout() {
    setLeaving(true);
    try {
      await sync?.flush().catch(() => {});
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: user ? { 'X-Account-Id': user.id } : {} });
      if (!response.ok) throw new Error('暂时无法退出，请重试。');
      sync?.dispose(); localStorage.setItem(marker, ''); window.location.replace('/');
    } catch { setLeaving(false); setError('暂时无法退出，请重试。'); }
  }
  if (loading || leaving) return <main className="account-loading"><span className="brand-icon"><Icon name="layers" size={28} /></span><h1>岗位探索</h1><p role="status">{leaving ? '正在退出账号…' : '正在读取你的准备记录…'}</p></main>;
  if (error && !sync) return <main className="account-loading"><h1>岗位探索</h1><p role="alert">{error}</p><div className="actions"><button className="primary" onClick={() => window.location.reload()}>重新读取</button>{user && <><button className="secondary" onClick={() => void readWorkspace().then(data => downloadData({ format: 'jdtool-backup', version: 2, ...data }))}>导出此浏览器资料</button><button className="secondary" onClick={logout}>退出账号</button></>}</div></main>;
  if (!user || !sync) return <SignIn />;
  return <>{error && <div className="notice error" role="alert">{error}</div>}<Workbench account={user} sync={sync} onLogout={logout} /></>;
}

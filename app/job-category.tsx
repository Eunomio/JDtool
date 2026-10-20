'use client';
import { useState, type FormEvent } from 'react';
import { database, type Job } from '../lib/database';
import { categoryFor, roleCategories, roleInputVersion, type RoleCategoryId } from '../lib/role-taxonomy';
import { needsRoleClassification } from '../lib/role-storage';
import { Icon } from './ui';

export default function JobCategory({ job, refresh, onRecognize }: { job: Job; refresh: () => Promise<void>; onRecognize: (job: Job) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RoleCategoryId | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const category = categoryFor(job);
  const classification = job.classification?.inputVersion === roleInputVersion(job) ? job.classification : undefined;

  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const updated = await database.transaction('rw', database.jobs, async () => {
        const current = await database.jobs.get(job.id);
        if (!current) throw new Error('这个岗位已移除，请返回岗位清单。');
        const next = { ...current };
        if (draft) next.categoryOverride = draft; else delete next.categoryOverride;
        await database.jobs.put(next);
        return next;
      });
      await refresh(); setEditing(false);
      setMessage(draft ? '岗位类型已更新。' : '已恢复自动识别。');
      if (!draft && needsRoleClassification(updated)) onRecognize(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '岗位类型暂时无法保存，请重试。'); }
    finally { setBusy(false); }
  }

  return <section className="role-insight-banner job-category"><div className="icon-tile"><Icon name="layers" /></div><div><h2>{category.name}</h2>{classification?.evidence.length ? <details><summary>查看分类的JD依据</summary>{classification.reason && <p>{classification.reason}</p>}{classification.evidence.map(quote => <blockquote key={quote}>{quote}</blockquote>)}</details> : null}</div><button className="secondary" aria-expanded={editing} aria-controls="job-category-form" disabled={busy} onClick={() => { setDraft(job.categoryOverride || ''); setError(''); setMessage(''); setEditing(value => !value); }}>修改岗位类型</button>
    {editing && <form id="job-category-form" className="job-category-form" onSubmit={save}><label>岗位类型<select aria-label="岗位类型" value={draft} disabled={busy} onChange={event => setDraft(event.target.value as RoleCategoryId | '')}><option value="">自动识别{classification ? ` · ${roleCategories.find(item => item.id === classification.categoryId)?.name}` : ''}</option>{roleCategories.filter(item => item.id !== 'undetermined').map(item => <option key={item.id} value={item.id}>{item.family} · {item.name}</option>)}</select><small className="muted">手动选择后将保留你的设置。选回“自动识别”可恢复按JD判断。</small></label><div className="actions"><button className="secondary" type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>取消</button><button className="primary" type="submit" disabled={busy}>{busy ? '正在保存…' : '保存岗位类型'}</button></div>{error && <p className="notice error" role="alert">{error}</p>}</form>}
    {message && <p className="job-category-message" role="status">{message}</p>}
  </section>;
}

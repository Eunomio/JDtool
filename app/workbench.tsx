'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { database, statuses, type Job, type JobStatus } from '../lib/database';

export default function Workbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [deleted, setDeleted] = useState<Job | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);

  async function refresh() {
    setJobs(await database.jobs.orderBy('updatedAt').reverse().toArray());
  }

  useEffect(() => {
    refresh().then(() => setReady(true)).catch(() => setError('无法读取已保存的岗位，请检查浏览器是否允许保存网站数据。'));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const title = String(fields.get('title') || '').trim();
    const company = String(fields.get('company') || '').trim();
    const content = String(fields.get('content') || '').trim();
    if (!title || !content) { setError('请填写岗位名称和岗位正文。'); return; }
    setBusy(true);
    setError('');
    try {
      const now = new Date().toISOString();
      await database.jobs.put({
        id: editing?.id || crypto.randomUUID(), title, company, content,
        status: editing?.status || '关注中', nextAction: editing?.nextAction || '',
        createdAt: editing?.createdAt || now, updatedAt: now,
      });
      await refresh();
      form.reset();
      setEditing(null);
    } catch { setError('保存失败，输入内容已保留，请重试。'); }
    finally { setBusy(false); }
  }

  async function update(job: Job, change: Partial<Pick<Job, 'status' | 'nextAction'>>) {
    try {
      await database.jobs.update(job.id, { ...change, updatedAt: new Date().toISOString() });
      await refresh();
    } catch { setError('保存失败，请重试。'); }
  }

  async function remove(job: Job) {
    if (!window.confirm(`删除“${job.company ? `${job.company} · ` : ''}${job.title}”？`)) return;
    try {
      await database.jobs.delete(job.id);
      setDeleted(job);
      if (editing?.id === job.id) setEditing(null);
      await refresh();
    } catch { setError('删除失败，请重试。'); }
  }

  async function undo() {
    if (!deleted) return;
    try { await database.jobs.put(deleted); await refresh(); setDeleted(null); }
    catch { setError('恢复失败，请重试。'); }
  }

  const visible = jobs.filter((job) => `${job.title} ${job.company}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <header className="topbar"><div className="brand"><span className="brand-icon">J</span>岗位探索与求职准备助手</div><span className="save-location">记录保存在当前浏览器</span></header>
      <main>
        <div className="intro"><p className="eyebrow">我的求职准备</p><h1>把每一个机会，准备得更清楚。</h1><p>保存目标岗位，记录投递进展，安排下一步行动。</p></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {deleted && <div className="notice" role="status">已删除“{deleted.title}”<button className="text-button" onClick={undo}>撤销</button><button className="text-button" onClick={() => setDeleted(null)}>关闭</button></div>}
        <div className="workspace">
          <section className="panel entry">
            <h2>{editing ? '编辑岗位' : '添加目标岗位'}</h2><p className="muted">复制招聘页面中的岗位信息，保存后随时查看。</p>
            <form key={editing?.id || 'new'} onSubmit={save}>
              <label>岗位名称<input name="title" required maxLength={120} defaultValue={editing?.title} placeholder="例如：产品经理" /></label>
              <label>公司名称<span className="optional">选填</span><input name="company" maxLength={120} defaultValue={editing?.company} placeholder="填写目标公司" /></label>
              <label>岗位正文<textarea name="content" required maxLength={30000} rows={10} defaultValue={editing?.content} placeholder="粘贴岗位职责、任职要求等内容" /></label>
              <div className="actions"><button className="primary" type="submit" disabled={busy || !ready}>{busy ? '保存中…' : '保存岗位'}</button>{editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>取消编辑</button>}</div>
            </form>
          </section>
          <section className="job-list" aria-labelledby="jobs-heading">
            <div className="list-heading"><h2 id="jobs-heading">岗位清单 <span className="count">{jobs.length}</span></h2><label className="search-label"><span className="sr-only">搜索岗位或公司</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位或公司" /></label></div>
            {!ready && !error && <div className="panel empty" role="status">正在读取岗位记录…</div>}
            {ready && visible.length === 0 && <div className="panel empty"><span className="empty-mark">＋</span><h3>{query ? '没有找到相关岗位' : '从一个感兴趣的岗位开始'}</h3><p>{query ? '试试其他关键词。' : '在左侧填写岗位信息，建立自己的目标清单。'}</p></div>}
            {visible.map((job) => <article className="panel job" key={job.id}>
              <div className="job-heading"><div><p className="company">{job.company || '公司待补充'}</p><h3>{job.title}</h3></div><label><span className="sr-only">{job.title}投递状态</span><select aria-label={`${job.title}投递状态`} value={job.status} onChange={(event) => update(job, { status: event.target.value as JobStatus })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label></div>
              <details><summary>查看岗位正文</summary><p className="job-content">{job.content}</p></details>
              <label className="next-action">下一步行动<input key={`${job.id}-${job.nextAction}`} defaultValue={job.nextAction} maxLength={300} placeholder="例如：整理一个需求分析项目" onBlur={(event) => { if (event.target.value !== job.nextAction) void update(job, { nextAction: event.target.value }); }} /></label>
              <div className="job-footer"><span>更新于 {new Date(job.updatedAt).toLocaleDateString('zh-CN')}</span><div><button className="text-button" onClick={() => { setEditing(job); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>编辑</button><button className="text-button danger" onClick={() => remove(job)}>删除</button></div></div>
            </article>)}
          </section>
        </div>
      </main>
    </>
  );
}

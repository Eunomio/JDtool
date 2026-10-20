'use client';
import { useEffect, useRef, useState } from 'react';
import { database, type Job } from '../lib/database';
import { categoryFor, roleCategories, roleInputVersion, type RoleCategoryId, type RoleClassification } from '../lib/role-taxonomy';
import { Icon } from './ui';

type ClassificationState = Pick<Job, 'classification' | 'categoryOverride'>;
type Change = { id: string; version: string; before: ClassificationState; after: ClassificationState };
const same = (a: ClassificationState, b: ClassificationState) => JSON.stringify([a.classification, a.categoryOverride]) === JSON.stringify([b.classification, b.categoryOverride]);

export default function RoleManager({ jobs, refresh, onOpen }: { jobs: Job[]; refresh: () => Promise<void>; onOpen: (job: Job) => void }) {
  const [selected, setSelected] = useState<string[]>(() => jobs.filter(job => categoryFor(job).id === 'undetermined').map(job => job.id));
  const [suggestions, setSuggestions] = useState<Record<string, RoleClassification>>({});
  const [target, setTarget] = useState<RoleCategoryId>('experience_design');
  const [preview, setPreview] = useState(false); const [changes, setChanges] = useState<Change[]>([]);
  const [busy, setBusy] = useState(false); const [completed, setCompleted] = useState(0);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { setSelected(ids => ids.filter(id => jobs.some(job => job.id === id))); }, [jobs]);
  const chosen = jobs.filter(job => selected.includes(job.id));
  const applicable = chosen.filter(job => suggestions[job.id]?.inputVersion === roleInputVersion(job) && suggestions[job.id].confidence !== 'low' && suggestions[job.id].categoryId !== 'undetermined' && !same(job, { classification: suggestions[job.id], categoryOverride: undefined }));
  const grouped = roleCategories.map(category => ({ ...category, jobs: jobs.filter(job => categoryFor(job).id === category.id) })).filter(category => category.jobs.length);

  async function analyze() {
    if (controller.current) return;
    const next = new AbortController(); controller.current = next;
    setBusy(true); setError(''); setMessage(''); setCompleted(0); setPreview(false);
    const eligible = chosen.filter(job => job.content.trim().length >= 15);
    try {
      if (!eligible.length) throw new Error('请先选择有完整JD的岗位。');
      for (let offset = 0; offset < eligible.length; offset += 6) {
        next.signal.throwIfAborted();
        const batch = eligible.slice(offset, offset + 6);
        const response = await fetch('/api/jobs/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([next.signal, AbortSignal.timeout(150000)]), body: JSON.stringify({ jobs: batch.map(job => ({ id: job.id, title: job.title, content: job.content, responsibilities: job.responsibilities, requirements: job.requirements })) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || '这批岗位尚未归类，请重试。');
        const entries = (data.classifications as { jobId: string; classification: RoleClassification }[]).filter(row => batch.some(job => job.id === row.jobId && roleInputVersion(job) === row.classification.inputVersion));
        setSuggestions(previous => ({ ...previous, ...Object.fromEntries(entries.map(row => [row.jobId, row.classification])) }));
        setCompleted(Math.min(offset + batch.length, eligible.length));
      }
      setMessage('归类建议已准备好，核对依据后即可应用。');
    } catch (cause) { if (!next.signal.aborted) setError(cause instanceof Error ? cause.message : '归类尚未完成，请重试。'); else setMessage('已停止分析，已得到的建议仍可查看。'); }
    finally { controller.current = null; setBusy(false); }
  }

  async function changeCategories(mode: 'suggestions' | 'merge') {
    setBusy(true); setError(''); setMessage('');
    try {
      const items = mode === 'suggestions' ? applicable : chosen;
      if (!items.length) throw new Error('请先选择要调整的岗位。');
      const updated = await database.transaction('rw', database.jobs, async () => {
        const records: Change[] = [];
        for (const job of items) {
          const current = await database.jobs.get(job.id);
          if (!current || roleInputVersion(current) !== roleInputVersion(job) || !same(current, job)) throw new Error('有岗位刚刚被修改或移除，请刷新分类结果后再应用。');
          const after: ClassificationState = mode === 'merge' ? { classification: current.classification, categoryOverride: target } : { classification: suggestions[job.id], categoryOverride: undefined };
          const next = { ...current, ...after }; if (!after.categoryOverride) delete next.categoryOverride;
          await database.jobs.put(next);
          records.push({ id: job.id, version: roleInputVersion(job), before: { classification: current.classification, categoryOverride: current.categoryOverride }, after });
        }
        return records;
      });
      setChanges(updated); setPreview(false); await refresh();
      setMessage(mode === 'merge' ? `已将${updated.length}个岗位归入“${roleCategories.find(category => category.id === target)?.name}”。` : `已应用${updated.length}个岗位的分类建议。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '这次调整未完成，请重试。'); }
    finally { setBusy(false); }
  }

  async function undo() {
    setBusy(true); setError('');
    try {
      await database.transaction('rw', database.jobs, async () => {
        for (const change of changes) {
          const current = await database.jobs.get(change.id);
          if (!current || roleInputVersion(current) !== change.version || !same(current, change.after)) throw new Error('有岗位已再次修改或移除，本次撤销未修改任何记录。');
          const next = { ...current, ...change.before }; if (!change.before.categoryOverride) delete next.categoryOverride;
          if (!change.before.classification) delete next.classification;
          await database.jobs.put(next);
        }
      });
      setChanges([]); await refresh(); setMessage('已撤销本次分类调整。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法撤销，请重试。'); }
    finally { setBusy(false); }
  }

  return <div className="page-stack"><header className="page-title"><div><p className="eyebrow">让同一种工作，站到一起</p><h1>岗位归类</h1><p className="muted">看职责、工作方法和交付内容，把不同名字下的相似机会放在一起。</p></div><span className="pill"><Icon name="layers" size={16} />{grouped.length}个类别 · {jobs.length}个机会</span></header>
    <section className="category-guide"><div className="category-example"><span>交互设计师</span><span>体验设计师</span><Icon name="arrow" /><strong>用户体验设计</strong></div><p>同名岗位也可能做不同的事。每次归类都可以展开查看JD依据，再按你的理解调整。</p></section>
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status"><Icon name="check" size={17} />{message}{changes.length > 0 && <button className="secondary small" disabled={busy} onClick={undo}>撤销本次调整</button>}</div>}
    <div className="classification-layout"><section className="panel"><div className="section-heading"><div><h2>选择要整理的岗位</h2><p className="muted">已选{selected.length}个，分析完成后先预览结果。</p></div><button className="secondary small" disabled={busy || !jobs.length} onClick={() => setSelected(selected.length === jobs.length ? [] : jobs.map(job => job.id))}>{selected.length === jobs.length ? '取消全选' : '选择全部'}</button></div>
      {!jobs.length && <div className="empty"><Icon name="layers" size={36} /><h3>添加岗位后，就能整理分类</h3><p>岗位名称会保留，公司记录和投递进度也会保留。</p></div>}
      <div className="classification-list">{jobs.map(job => { const suggested = suggestions[job.id]; const current = categoryFor(job); const valid = suggested?.inputVersion === roleInputVersion(job); return <article className={`classification-card ${selected.includes(job.id) ? 'selected' : ''}`} key={job.id}><div className="classification-card-heading"><label className="inline"><input type="checkbox" aria-label={`选择归类 ${job.company} ${job.title}`} checked={selected.includes(job.id)} disabled={busy} onChange={event => { setSelected(ids => event.target.checked ? [...ids, job.id] : ids.filter(id => id !== job.id)); setPreview(false); }} /><span><small>{job.company}</small><strong>{job.title}</strong></span></label><span className={`category-badge ${current.id === 'undetermined' ? 'pending' : ''}`}>{current.name}</span></div>
        {valid && <div className="suggestion-body"><div className="suggestion-heading"><Icon name="sparkles" size={17} /><strong>建议：{roleCategories.find(category => category.id === suggested.categoryId)?.name}</strong><span className="muted">{suggested.confidence === 'low' ? '需要你确认' : suggested.confidence === 'medium' ? '较为匹配' : '职责匹配'}</span></div><p>{suggested.reason}</p><details><summary>查看JD原句依据</summary>{suggested.evidence.map(quote => <blockquote key={quote}>{quote}</blockquote>)}</details></div>}
        {suggested && !valid && <p className="muted">JD已修改，重新分析可更新分类建议。</p>}
        {!suggested && <p className="muted">{job.categoryOverride ? '已按你的选择调整类别' : job.classification?.inputVersion === roleInputVersion(job) ? job.classification.reason : '还没有根据当前JD分析类别'}</p>}
        <button className="text-button" disabled={busy} onClick={() => onOpen(job)}>查看这份JD <Icon name="arrow" size={14} /></button></article>; })}</div>
    </section><aside className="classification-actions panel"><span className="icon-tile"><Icon name="sparkles" size={24} /></span><h2>从工作内容发现共同点</h2><p className="muted">一次核对多份JD，分别保留每个岗位的判断依据。</p><button className="primary full-width" disabled={busy || !selected.length} onClick={analyze}><Icon name="sparkles" size={17} />{busy && controller.current ? `正在分析 ${completed}/${chosen.filter(job => job.content.trim().length >= 15).length}` : '分析所选JD并归类'}</button>{busy && controller.current && <button className="secondary full-width" onClick={() => controller.current?.abort()}>停止分析</button>}
      {Object.keys(suggestions).length > 0 && <button className="secondary full-width" disabled={busy || !applicable.length} onClick={() => changeCategories('suggestions')}>应用建议分类（{applicable.length}）</button>}
      <div className="merge-tools"><h3>按你的理解合并分类</h3><p className="muted">为所选岗位指定同一个类别，方便一起比较和准备。</p><label>合并到<select aria-label="合并到" value={target} disabled={busy} onChange={event => { setTarget(event.target.value as RoleCategoryId); setPreview(false); }}>{roleCategories.filter(category => category.id !== 'undetermined').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="secondary full-width" disabled={busy || chosen.length < 2} onClick={() => setPreview(true)}><Icon name="merge" size={17} />预览合并（{chosen.length}）</button>
      {preview && <div className="merge-preview"><strong>{chosen.length}个岗位 → {roleCategories.find(category => category.id === target)?.name}</strong><ul>{chosen.map(job => <li key={job.id}>{job.company} · {job.title}</li>)}</ul><p>保留每份JD、公司和投递记录。</p><button className="primary full-width" disabled={busy} onClick={() => changeCategories('merge')}>确认合并分类</button></div>}</div>
    </aside></div>
  </div>;
}

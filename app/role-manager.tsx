'use client';
import { useEffect, useState } from 'react';
import { database, type Job } from '../lib/database';
import { categoryFor, roleCategories, roleInputVersion, type RoleCategoryId } from '../lib/role-taxonomy';
import { classificationState } from '../lib/role-storage';
import type { RoleAnalysis } from './use-role-classification';
import { Icon } from './ui';

type ClassificationState = Pick<Job, 'classification' | 'categoryOverride'>;
type Change = { id: string; version: string; before: ClassificationState; after: ClassificationState };

export default function RoleManager({ jobs, refresh, onOpen, analysis }: { jobs: Job[]; refresh: () => Promise<void>; onOpen: (job: Job) => void; analysis: RoleAnalysis }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<RoleCategoryId>('experience_design');
  const [changes, setChanges] = useState<Change[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { setSelected(ids => ids.filter(id => jobs.some(job => job.id === id))); }, [jobs]);
  const chosen = jobs.filter(job => selected.includes(job.id));
  const busy = saving || analysis.busy;
  const grouped = roleCategories.filter(category => jobs.some(job => categoryFor(job).id === category.id));

  async function merge() {
    setSaving(true); setError(''); setMessage('');
    try {
      const updated = await database.transaction('rw', database.jobs, async () => {
        const records: Change[] = [];
        for (const job of chosen) {
          const current = await database.jobs.get(job.id);
          if (!current || roleInputVersion(current) !== roleInputVersion(job) || classificationState(current) !== classificationState(job)) throw new Error('有岗位刚刚被修改或移除，请刷新后再合并。');
          const after = { classification: current.classification, categoryOverride: target };
          await database.jobs.put({ ...current, ...after });
          records.push({ id: job.id, version: roleInputVersion(job), before: { classification: current.classification, categoryOverride: current.categoryOverride }, after });
        }
        return records;
      });
      setChanges(updated); await refresh();
      setMessage(`已将${updated.length}个岗位归入“${roleCategories.find(category => category.id === target)?.name}”。`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '这次合并未完成，请重试。'); }
    finally { setSaving(false); }
  }

  async function undo() {
    setSaving(true); setError('');
    try {
      await database.transaction('rw', database.jobs, async () => {
        for (const change of changes) {
          const current = await database.jobs.get(change.id);
          if (!current || roleInputVersion(current) !== change.version || classificationState(current) !== classificationState(change.after)) throw new Error('有岗位已再次修改或移除，本次撤销未修改任何记录。');
          const next = { ...current, ...change.before }; if (!change.before.categoryOverride) delete next.categoryOverride;
          if (!change.before.classification) delete next.classification;
          await database.jobs.put(next);
        }
      });
      setChanges([]); await refresh(); setMessage('已撤销本次分类调整。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法撤销，请重试。'); }
    finally { setSaving(false); }
  }

  return <div className="page-stack"><header className="page-title"><div><p className="eyebrow">让同一种工作，站到一起</p><h1>岗位归类</h1><p className="muted">自动分析JD的职责和工作内容，将不同名字下的相似机会归到一起。</p></div><span className="pill"><Icon name="layers" size={16} />{grouped.length}个类别 · {jobs.length}个机会</span></header>
    <section className="category-guide"><div className="category-example"><span>交互设计师</span><span>体验设计师</span><Icon name="arrow" /><strong>用户体验设计</strong></div><p>分类完成后直接保存，随时可以展开查看JD依据。</p></section>
    {(error || analysis.error) && <div className="notice error" role="alert">{error || analysis.error}</div>}
    {analysis.busy && <div className="notice" role="status"><Icon name="sparkles" size={17} />正在自动整理岗位类别 {analysis.completed}/{analysis.total}<button className="secondary small" onClick={analysis.stop}>停止分析</button></div>}
    {analysis.message && <div className="notice success" role="status"><Icon name="check" size={17} />{analysis.message}</div>}
    {message && <div className="notice success" role="status"><Icon name="check" size={17} />{message}{changes.length > 0 && <button className="secondary small" disabled={busy} onClick={undo}>撤销本次调整</button>}</div>}
    <div className="classification-layout"><section className="panel"><div className="section-heading"><div><h2>已按工作内容整理</h2><p className="muted">新增岗位或修改JD后自动归类。选中岗位还可以重新分析或手动合并。</p></div><button className="secondary small" disabled={busy || !jobs.length} onClick={() => setSelected(selected.length === jobs.length ? [] : jobs.map(job => job.id))}>{selected.length === jobs.length ? '取消全选' : '选择全部'}</button></div>
      {!jobs.length && <div className="empty"><Icon name="layers" size={36} /><h3>添加岗位后，自动整理分类</h3><p>岗位名称、公司记录和投递进度都会保留。</p></div>}
      <div className="classification-list">{jobs.map(job => { const current = categoryFor(job); const classification = job.classification?.inputVersion === roleInputVersion(job) ? job.classification : undefined; return <article className={`classification-card ${selected.includes(job.id) ? 'selected' : ''}`} key={job.id}>
        <div className="classification-card-heading"><label className="inline"><input type="checkbox" aria-label={`选择归类 ${job.company} ${job.title}`} checked={selected.includes(job.id)} disabled={busy} onChange={event => setSelected(ids => event.target.checked ? [...ids, job.id] : ids.filter(id => id !== job.id))} /><span><small>{job.company}</small><strong>{job.title}</strong></span></label><span className={`category-badge ${current.id === 'undetermined' ? 'pending' : ''}`}>{current.name}</span></div>
        <p className="muted">{job.categoryOverride ? '已按你的选择调整类别' : classification?.reason || (job.content.trim().length < 15 ? '补充职责和要求后，将自动归类。' : analysis.busy ? '正在根据JD整理类别。' : '尚未完成归类，可以重新分析。')}</p>
        {!!classification?.evidence.length && <details><summary>查看JD原句依据</summary>{classification.evidence.map(quote => <blockquote key={quote}>{quote}</blockquote>)}</details>}
        <button className="text-button" onClick={() => onOpen(job)}>查看这份JD <Icon name="arrow" size={14} /></button></article>; })}</div>
    </section><aside className="classification-actions panel"><span className="icon-tile"><Icon name="sparkles" size={24} /></span><h2>从工作内容发现共同点</h2><p className="muted">归类会自动完成，无需逐个确认。需要重新判断时，也可以再分析一次。</p><button className="primary full-width" disabled={busy || !jobs.length} onClick={() => { setMessage(''); setError(''); void analysis.analyze(chosen.length ? chosen : jobs); }}><Icon name="sparkles" size={17} />{chosen.length ? `重新归类所选JD（${chosen.length}）` : '重新分析全部JD'}</button>
      <div className="merge-tools"><h3>按你的理解合并分类</h3><p className="muted">选中岗位并指定同一个类别，方便一起比较和准备。</p><label>合并到<select aria-label="合并到" value={target} disabled={busy} onChange={event => setTarget(event.target.value as RoleCategoryId)}>{roleCategories.filter(category => category.id !== 'undetermined').map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><button className="secondary full-width" disabled={busy || chosen.length < 2} onClick={merge}><Icon name="merge" size={17} />合并所选岗位（{chosen.length}）</button></div>
    </aside></div>
  </div>;
}

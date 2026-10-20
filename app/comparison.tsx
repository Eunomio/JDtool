'use client';
import { useEffect, useState } from 'react';
import { database, type CompareResult, type Job, type Project, type SavedResult, type Source } from '../lib/database';
import { api, inputVersion, modelProjects } from '../lib/client';
import { AdviceList } from './evidence';
import { saveProjectResult } from '../lib/project-storage';
import { categoryFor } from '../lib/role-taxonomy';

export default function Comparison({ jobs, projects, sources, addTask }: { jobs: Job[]; projects: Project[]; sources: Source[]; addTask: (text: string, jobIds: string[]) => void }) {
  const [mode, setMode] = useState('similar');
  const [direction, setDirection] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SavedResult<CompareResult> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const next = selected.filter((id) => jobs.some((job) => job.id === id)); if (next.length !== selected.length) { setSelected(next); setResult(null); } }, [jobs]);
  useEffect(() => { database.comparisons.toArray().then((items) => { const latest = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; if (latest) { const ids = latest.jobId.split('|').filter((id) => jobs.some((job) => job.id === id)); if (ids.length >= 2) { setSelected(ids); setResult(latest); } } }); }, []);
  const selectedJobs = selected.map((id) => jobs.find((job) => job.id === id)).filter(Boolean) as Job[];
  const version = selectedJobs.map((job) => inputVersion(job, projects, sources.filter((source) => source.jobId === job.id))).join('|');
  const directions = [...new Set(jobs.map(job => categoryFor(job).name))];
  async function generate() {
    setBusy(true); setError('');
    try { const data = await api<CompareResult>('/api/assist', { action: 'compare', jobs: selectedJobs, projects: modelProjects(projects), sources: sources.filter((source) => selected.includes(source.jobId || '')), mode }); const saved = { id: crypto.randomUUID(), jobId: selected.join('|'), inputVersion: version, data, createdAt: new Date().toISOString() }; await saveProjectResult('comparisons', saved, projects); setResult(saved); }
    catch (error) { setError(error instanceof Error ? error.message : '比较未完成，请重试。'); }
    finally { setBusy(false); }
  }
  return <div className="page-stack"><section className="panel"><h1>岗位比较</h1><p className="muted">找到可复用的准备内容和每个机会需要分别准备的部分。</p><div className="tabs" role="tablist" aria-label="比较方式"><button role="tab" aria-selected={mode === 'similar'} onClick={() => { setMode('similar'); setResult(null); }}>相近岗位比较</button><button role="tab" aria-selected={mode === 'cross'} onClick={() => { setMode('cross'); setDirection(''); setResult(null); }}>跨方向比较</button></div>{mode === 'similar' && <label>岗位方向<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">选择方向或查看全部</option>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select></label>}
    <p>勾选2—3个岗位。你可以自行判断哪些岗位适合放在一起比较。</p><div className="selection-grid">{jobs.filter((job) => !direction || categoryFor(job).name === direction).map((job) => <label key={job.id} className="selection-card"><input type="checkbox" checked={selected.includes(job.id)} disabled={busy || (!selected.includes(job.id) && selected.length >= 3)} onChange={(event) => { setSelected((items) => event.target.checked ? [...items, job.id] : items.filter((id) => id !== job.id)); setResult(null); }} /><span><strong>{job.company} · {job.title}</strong><small>{categoryFor(job).name} {job.location}</small></span></label>)}</div>
    {!jobs.length && <p>添加岗位后即可比较，也可先使用示例岗位。</p>}<p className="privacy-note">比较会使用所选JD、已确认的项目事实和相关公司资料。</p><button className="primary" disabled={busy || selectedJobs.length < 2} onClick={generate}>{busy ? '正在比较要求与准备重点…' : '比较所选岗位'}</button>{error && <div className="notice error" role="alert">{error}</div>}
  </section>{result && <section className="panel"><h2>比较结果</h2>{result.inputVersion !== version && <p className="notice">所选岗位或资料有更新，请重新比较。</p>}<AdviceList title="共通能力" items={result.data.common} jobs={selectedJobs} projects={projects} sources={sources} addTask={(text) => addTask(text, selected)} /><div className="comparison-table">{result.data.differences.filter((item) => selectedJobs.some((job) => job.id === item.jobId)).map((item) => { const job = jobs.find((job) => job.id === item.jobId)!; return <div key={item.jobId} className="comparison-column"><h3>{job.company} · {job.title}</h3><AdviceList title="独有要求与业务场景" items={item.uniqueRequirements} jobs={[job]} projects={projects} sources={sources} /><AdviceList title="推荐讲述项目" items={item.projects} jobs={[job]} projects={projects} sources={sources} /><AdviceList title="补充知识与准备重点" items={item.preparation} jobs={[job]} projects={projects} sources={sources} addTask={(text) => addTask(text, [job.id])} /></div>; })}</div><AdviceList title="可复用的准备内容" items={result.data.reusable} jobs={selectedJobs} projects={projects} sources={sources} addTask={(text) => addTask(text, selected)} /></section>}</div>;
}

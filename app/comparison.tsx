'use client';
import { useEffect, useRef, useState } from 'react';
import { database, type CompareResult, type Job, type Project, type SavedResult, type Source } from '../lib/database';
import { api, inputVersion, modelProjects } from '../lib/client';
import { AdviceList } from './evidence';
import { saveProjectResult } from '../lib/project-storage';
import { Tabs } from './ui';
import { categoryFor } from '../lib/role-taxonomy';

export default function Comparison({ jobs, projects, sources, addTask, ready }: { jobs: Job[]; projects: Project[]; sources: Source[]; addTask: (text: string, jobIds: string[]) => void; ready: boolean }) {
  const [section, setSection] = useState<'common' | 'differences' | 'reusable'>('common');
  const [mode, setMode] = useState('similar');
  const [direction, setDirection] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SavedResult<CompareResult> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(true);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { const next = selected.filter((id) => jobs.some((job) => job.id === id)); if (next.length !== selected.length) { setSelected(next); setResult(null); } }, [jobs]);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    database.comparisons.toArray().then(items => {
      if (!active) return;
      const latest = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find(item => { const ids = item.jobId.split('|'); return ids.length >= 2 && ids.every(id => jobs.some(job => job.id === id)); });
      if (latest) { setSelected(latest.jobId.split('|')); setResult(latest); }
    }).catch(() => { if (active) setError('比较记录暂时未能读取，可以重新选择岗位比较。'); }).finally(() => { if (active) setRestoring(false); });
    return () => { active = false; };
  }, [ready]);
  const showingResult = !!result;
  useEffect(() => { if (ready && !restoring) { title.current?.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'instant' }); } }, [showingResult, ready, restoring]);
  const selectedJobs = selected.map((id) => jobs.find((job) => job.id === id)).filter(Boolean) as Job[];
  const version = selectedJobs.map((job) => inputVersion(job, projects, sources.filter((source) => source.jobId === job.id))).join('|');
  const directions = [...new Set(jobs.map(job => categoryFor(job).name))];
  async function generate() {
    setBusy(true); setError('');
    try { const data = await api<CompareResult>('/api/assist', { action: 'compare', jobs: selectedJobs, projects: modelProjects(projects), sources: sources.filter((source) => selected.includes(source.jobId || '')), mode }); const saved = { id: crypto.randomUUID(), jobId: selected.join('|'), inputVersion: version, data, createdAt: new Date().toISOString() }; await saveProjectResult('comparisons', saved, projects); setResult(saved); setSection('common'); }
    catch (error) { setError(error instanceof Error ? error.message : '比较未完成，请重试。'); }
    finally { setBusy(false); }
  }
  if (!ready || restoring) return <section className="panel" role="status">正在读取比较记录…</section>;
  return <div className="page-stack comparison-page">{!result ? <section className="panel comparison-setup"><h1 ref={title} tabIndex={-1}>岗位比较</h1><div className="tabs" role="tablist" aria-label="比较方式"><button role="tab" disabled={busy} aria-selected={mode === 'similar'} onClick={() => { setMode('similar'); setResult(null); }}>相近岗位比较</button><button role="tab" disabled={busy} aria-selected={mode === 'cross'} onClick={() => { setMode('cross'); setDirection(''); setResult(null); }}>跨方向比较</button></div>{mode === 'similar' && <label>岗位方向<select disabled={busy} value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">选择方向或查看全部</option>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select></label>}
    <p>选择2—3个岗位</p><div className="selection-grid">{jobs.filter((job) => !direction || categoryFor(job).name === direction).map((job) => <label key={job.id} className="selection-card"><input type="checkbox" checked={selected.includes(job.id)} disabled={busy || (!selected.includes(job.id) && selected.length >= 3)} onChange={(event) => { setSelected((items) => event.target.checked ? [...items, job.id] : items.filter((id) => id !== job.id)); setResult(null); }} /><span><strong>{job.company} · {job.title}</strong><small>{categoryFor(job).name} {job.location}</small></span></label>)}</div>
    {!jobs.length && <p>添加岗位后即可比较，也可先使用示例岗位。</p>}<p className="privacy-note">比较会使用所选JD、已确认的项目事实和相关公司资料。</p><button className="primary" disabled={busy || selectedJobs.length < 2} onClick={generate}>{busy ? '正在比较要求与准备重点…' : '比较所选岗位'}</button>{error && <div className="notice error" role="alert">{error}</div>}
  </section> : <section className="panel comparison-results"><div className="section-heading"><h1 ref={title} tabIndex={-1}>比较结果</h1><button className="secondary" onClick={() => { setResult(null); setError(''); setSection('common'); }}>重新比较</button></div><div className="comparison-scope" aria-label="本次比较的岗位">{selectedJobs.map(job => <span className="tag" key={job.id}>{job.company} · {job.title}</span>)}</div>{result.inputVersion !== version && <p className="notice">所选岗位或资料有更新，请重新比较。</p>}<Tabs label="比较结果内容" className="content-tabs" value={section} items={[{id:'common',label:'共通能力'},{id:'differences',label:'岗位对比'},{id:'reusable',label:'可复用准备'}]} onChange={setSection} />
    <div role="tabpanel" id="比较结果内容-panel-common" aria-labelledby="比较结果内容-common" hidden={section !== 'common'}><AdviceList title="共通能力" items={result.data.common} jobs={selectedJobs} projects={projects} sources={sources} addTask={(text) => addTask(text, selected)} /></div>
    <div role="tabpanel" id="比较结果内容-panel-differences" aria-labelledby="比较结果内容-differences" hidden={section !== 'differences'}><div className="comparison-table">{result.data.differences.filter((item) => selectedJobs.some((job) => job.id === item.jobId)).map((item) => { const job = jobs.find((job) => job.id === item.jobId)!; return <div key={item.jobId} className="comparison-column"><h3>{job.company} · {job.title}</h3><AdviceList title="独有要求与业务场景" items={item.uniqueRequirements} jobs={[job]} projects={projects} sources={sources} /><details><summary>推荐讲述项目</summary><AdviceList title="推荐讲述项目" items={item.projects} jobs={[job]} projects={projects} sources={sources} /></details><details><summary>补充知识与准备重点</summary><AdviceList title="补充知识与准备重点" items={item.preparation} jobs={[job]} projects={projects} sources={sources} addTask={(text) => addTask(text, [job.id])} /></details></div>; })}</div></div>
    <div role="tabpanel" id="比较结果内容-panel-reusable" aria-labelledby="比较结果内容-reusable" hidden={section !== 'reusable'}><AdviceList title="可复用的准备内容" items={result.data.reusable} jobs={selectedJobs} projects={projects} sources={sources} addTask={(text) => addTask(text, selected)} /></div></section>}</div>;
}

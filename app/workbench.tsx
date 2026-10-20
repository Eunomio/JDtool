'use client';

import { useEffect, useState } from 'react';
import { database, statuses, type Job, type JobStatus, type Project, type Source, type Task } from '../lib/database';
import { sampleJobs, sampleSources } from '../lib/samples';
import JobImporter from './job-importer';
import Projects from './projects';
import JobDetail from './job-detail';
import Comparison from './comparison';
import Practice from './practice';
import DataBackup from './data-backup';
import { deleteJob, restoreJob, type DeletedJob } from '../lib/job-storage';

type Page = 'jobs' | 'import' | 'detail' | 'projects' | 'compare' | 'interview' | 'scenario';
const nav = [['jobs', '岗位清单'], ['projects', '我的项目'], ['compare', '岗位比较'], ['interview', '模拟面试'], ['scenario', '岗位体验']] as const;

export default function Workbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState<Page>('jobs');
  const [selectedId, setSelectedId] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [deleted, setDeleted] = useState<DeletedJob | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);

  async function refresh() {
    const [a, b, c, d] = await Promise.all([database.jobs.orderBy('updatedAt').reverse().toArray(), database.projects.toArray(), database.sources.toArray(), database.tasks.orderBy('order').toArray()]);
    setJobs(a); setProjects(b); setSources(c); setTasks(d.filter((task) => task.jobIds.some((id) => a.some((job) => job.id === id))));
  }
  useEffect(() => { refresh().then(() => setReady(true)).catch(() => setError('无法读取已保存的资料，请检查浏览器是否允许保存网站数据。')); }, []);
  const selected = jobs.find((job) => job.id === selectedId);
  const practiceJob = selected || jobs[0];
  async function run(action: () => Promise<void>) { setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : '未能保存更改，请重试。'); } }
  function navigate(next: Page) { setPage(next); setEditing(null); setError(''); setMessage(''); window.scrollTo({ top: 0 }); }
  function open(job: Job) { setSelectedId(job.id); navigate('detail'); }
  function edit(job: Job) { setEditing(job); setSelectedId(job.id); setPage('import'); window.scrollTo({ top: 0 }); }
  async function update(job: Job, change: Partial<Job>) { await run(async () => { await database.jobs.update(job.id, { ...change, updatedAt: new Date().toISOString() }); await refresh(); }); }
  async function remove(job: Job) {
    if (!window.confirm(`删除“${job.company ? `${job.company} · ` : ''}${job.title}”？`)) return;
    await run(async () => { setDeleted(await deleteJob(job)); if (editing?.id === job.id) setEditing(null); await refresh(); });
  }
  async function undo() { if (deleted) await run(async () => { await restoreJob(deleted); await refresh(); setDeleted(null); }); }
  async function addTask(text: string, jobIds: string[]) { await run(async () => { if (!tasks.some((task) => task.text === text && task.jobIds.join() === jobIds.join())) await database.tasks.put({ id: crypto.randomUUID(), text, jobIds, done: false, order: tasks.length ? Math.max(...tasks.map((task) => task.order)) + 1 : 0, createdAt: new Date().toISOString() }); await refresh(); setMessage('已加入本周准备。'); }); }
  async function moveTask(task: Task, index: number) { if (index < 1) return; await run(async () => { const previous = tasks[index - 1]; await database.transaction('rw', database.tasks, async () => { await database.tasks.update(task.id, { order: previous.order }); await database.tasks.update(previous.id, { order: task.order }); }); await refresh(); }); }
  async function toggleTask(task: Task, done: boolean) { setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done } : item)); await run(async () => { await database.tasks.update(task.id, { done }); await refresh(); }); }
  const visible = jobs.filter((job) => `${job.title} ${job.company}`.toLowerCase().includes(query.toLowerCase()) && (!direction || job.direction === direction) && (!company || job.company === company) && (!status || job.status === status));
  const directions = [...new Set(jobs.map((job) => job.direction).filter(Boolean))] as string[];
  const companies = [...new Set(jobs.map((job) => job.company).filter(Boolean))];
  const filtered = !!(query || direction || company || status);
  const grouped = [...new Set(visible.map((job) => job.direction || '未分类'))].map((name) => [name, visible.filter((job) => (job.direction || '未分类') === name)] as const);

  return <><header className="topbar"><button className="brand brand-button" onClick={() => navigate('jobs')}><span className="brand-icon">J</span>岗位探索与求职准备助手</button><div className="top-actions"><span className="save-location">{projects.filter((project) => project.confirmed).length}个已确认项目 · 当前浏览器保存</span><button className="primary" onClick={() => navigate('import')}>新增JD</button><DataBackup refresh={refresh} /></div></header>
    <div className="app-shell"><aside className="sidebar"><nav aria-label="主要导航">{nav.map(([key, label]) => <button key={key} className={page === key || (key === 'jobs' && ['detail', 'import'].includes(page)) ? 'active' : ''} onClick={() => navigate(key)}>{label}</button>)}</nav><p>从岗位理解，到讲好自己的真实经历。</p></aside>
    <main className="app-main">{error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}{deleted && <div className="notice" role="status">已删除“{deleted.job.title}”<button className="text-button" onClick={undo}>撤销</button><button className="text-button" onClick={() => setDeleted(null)}>关闭</button></div>}
      {page === 'import' && <><button className="text-button back-button" onClick={() => navigate(selected ? 'detail' : 'jobs')}>返回{selected ? '岗位详情' : '岗位清单'}</button><JobImporter key={editing?.id || 'new'} ready={ready} editing={editing} onCancel={() => navigate(selected ? 'detail' : 'jobs')} onOpen={open} onSaved={async (job) => { await refresh(); setSelectedId(job.id); setEditing(null); setPage('detail'); setMessage('解析完成，可继续补充资料。'); window.scrollTo({ top: 0 }); }} /></>}
      {page === 'jobs' && <div className="page-stack"><div><p className="eyebrow">我的求职准备</p><h1>读懂岗位，找到适合讲述的经历。</h1><p className="muted">粘贴岗位链接或上传截图，核对解析内容后开始准备。</p></div>
        {tasks.length > 0 && <section className="panel"><div className="section-heading"><h2>本周准备</h2><span className="muted">已完成 {tasks.filter((task) => task.done).length}/{tasks.length}</span></div>{tasks.map((task, index) => <div className="task-row" key={task.id}><label className="inline"><input type="checkbox" checked={task.done} onChange={(event) => toggleTask(task, event.target.checked)} /><span className={task.done ? 'completed' : ''}>{task.text}<small>{task.jobIds.map((id) => jobs.find((job) => job.id === id)).filter(Boolean).map((job) => `${job!.company} ${job!.title}`).join('、')}</small></span></label><div><button className="text-button" disabled={index === 0} onClick={() => moveTask(task, index)}>前移</button><button className="text-button" onClick={() => run(async () => { await database.tasks.delete(task.id); await refresh(); })}>移除</button></div></div>)}</section>}
        <div className="status-strip">{statuses.map((item) => <button key={item} aria-pressed={status === item} onClick={() => setStatus(status === item ? '' : item)}>{item}<strong>{jobs.filter((job) => job.status === item).length}</strong></button>)}</div>
        <section aria-labelledby="jobs-heading"><div className="list-heading"><h2 id="jobs-heading">岗位清单 <span className="count">{jobs.length}</span></h2><button className="text-button" disabled={!ready} onClick={() => run(async () => { await database.jobs.bulkPut(sampleJobs().filter((job) => !jobs.some((current) => current.id === job.id))); await database.sources.bulkPut(sampleSources().filter((source) => !sources.some((current) => current.id === source.id))); await refresh(); })}>体验6个示例岗位</button></div>
        <div className="filter-bar"><input type="search" aria-label="搜索岗位或公司" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位或公司" /><select aria-label="按岗位方向筛选" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">全部方向</option>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select><select aria-label="按公司筛选" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">全部公司</option>{companies.map((company) => <option key={company}>{company}</option>)}</select><select aria-label="按投递状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>{filtered && <button className="text-button" onClick={() => { setQuery(''); setDirection(''); setCompany(''); setStatus(''); }}>清除筛选</button>}</div>
        {!ready && !error && <p role="status">正在读取岗位记录…</p>}{ready && !visible.length && <div className="panel empty"><span className="empty-mark">＋</span><h3>{filtered ? '没有找到相关岗位' : '从一个感兴趣的岗位开始'}</h3><p>{filtered ? '调整筛选或清除筛选，再看看其他机会。' : '提供招聘链接或JD截图，自动整理岗位内容。'}</p>{!filtered && <button className="primary" onClick={() => navigate('import')}>添加第一条JD</button>}</div>}
        <div className="job-grid">{grouped.flatMap(([name, records]) => [<h3 className="group-heading" key={`group-${name}`}>{name} <span className="count">{records.length}</span></h3>, ...records.map((job) => <article className="panel job clickable-card" key={job.id} tabIndex={0} onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,select,textarea,a,summary,details,label')) open(job); }} onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) open(job); }}>
          <div className="job-heading"><div><p className="company">{job.company || '公司待补充'} {job.sample ? '· 示例岗位' : ''}</p><h3><button className="title-button" onClick={() => open(job)}>{job.title}</button></h3></div><select aria-label={`${job.title}投递状态`} value={job.status} onChange={(event) => update(job, { status: event.target.value as JobStatus, statusHistory: [...(job.statusHistory || []), { status: event.target.value as JobStatus, at: new Date().toISOString() }] })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>
          <p className="muted">{[job.direction || '方向待补充', job.location, job.hiringType].filter(Boolean).join(' · ')}</p>{job.warnings?.length ? <span className="tag">待核对或补充</span> : null}<ul className="job-priorities">{[...(job.requirements || []), ...(job.responsibilities || [])].slice(0, 2).map((item) => <li key={item.id}>{item.text}</li>)}</ul><label className="next-action">下一步行动<input key={`${job.id}-${job.nextAction}`} defaultValue={job.nextAction} maxLength={300} placeholder="例如：整理一个需求分析项目" onBlur={(event) => { if (event.target.value !== job.nextAction) void update(job, { nextAction: event.target.value }); }} /></label><div className="job-footer"><span>更新于 {new Date(job.updatedAt).toLocaleDateString('zh-CN')}</span><div><button className="text-button" onClick={() => edit(job)}>编辑</button><button className="text-button danger" onClick={() => remove(job)}>删除</button></div></div>
        </article>)])}</div></section>
      </div>}
      {page === 'projects' && <Projects projects={projects} refresh={refresh} />}
      {page === 'detail' && selected && <><button className="text-button back-button" onClick={() => navigate('jobs')}>返回岗位清单</button><JobDetail key={selected.id} job={selected} projects={projects} sources={sources} refresh={refresh} onEdit={edit} onPractice={(mode, id) => { setSelectedId(id); navigate(mode); }} addTask={addTask} /></>}
      {page === 'compare' && <Comparison jobs={jobs} projects={projects} sources={sources} addTask={addTask} />}
      {(page === 'interview' || page === 'scenario') && <><label className="practice-selector">选择目标岗位<select value={practiceJob?.id || ''} onChange={(event) => setSelectedId(event.target.value)}><option value="" disabled>请选择岗位</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.company} · {job.title}</option>)}</select></label>{practiceJob ? <Practice key={`${page}-${practiceJob.id}`} job={practiceJob} mode={page} sources={sources} addTask={addTask} refresh={refresh} /> : <div className="panel empty"><h2>先添加一个目标岗位</h2><p>面试题和工作情境会结合该岗位的职责与要求。</p><button className="primary" onClick={() => navigate('import')}>新增JD</button></div>}</>}
    </main></div>
  </>;
}

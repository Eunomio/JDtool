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
import { saveTaskDone, recoverTaskChanges } from '../lib/task-storage';
import { displayProjectText } from '../lib/client';
import { deleteJob, restoreJob, type DeletedJob } from '../lib/job-storage';
import { Icon } from './ui';

type Page = 'jobs' | 'import' | 'detail' | 'projects' | 'compare' | 'interview' | 'scenario';
const nav = [['jobs', '岗位清单'], ['projects', '我的项目'], ['compare', '岗位比较'], ['interview', '模拟面试'], ['scenario', '岗位体验']] as const;

export default function Workbench() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [savingTasks, setSavingTasks] = useState<string[]>([]);
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
  const [listView, setListView] = useState(false);
  const [researched, setResearched] = useState<string[]>([]);
  const [resumeProjects, setResumeProjects] = useState(false);

  async function refresh() {
    const [a, b, c, d, e] = await Promise.all([database.jobs.orderBy('updatedAt').reverse().toArray(), database.projects.toArray(), database.sources.toArray(), database.tasks.orderBy('order').toArray(), database.companies.toArray()]);
    setJobs(a); setProjects(b); setSources(c); setTasks(d.filter((task) => task.jobIds.some((id) => a.some((job) => job.id === id))));
    setResearched([...new Set(e.filter((record) => record.data.research).map((record) => record.jobId))]);
  }
  useEffect(() => { recoverTaskChanges().then(refresh).then(() => setReady(true)).catch(() => setError('无法读取已保存的资料，请检查浏览器是否允许保存网站数据。')); }, []);
  const selected = jobs.find((job) => job.id === selectedId);
  const practiceJob = selected || jobs[0];
  async function run(action: () => Promise<void>) { setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : '未能保存更改，请重试。'); } }
  function navigate(next: Page) { setPage(next); setEditing(null); setError(''); setMessage(''); window.scrollTo({ top: 0 }); }
  function open(job: Job) { setSelectedId(job.id); setResumeProjects(false); navigate('detail'); }
  function edit(job: Job) { setEditing(job); setSelectedId(job.id); setPage('import'); window.scrollTo({ top: 0 }); }
  async function update(job: Job, change: Partial<Job>) { await run(async () => { await database.jobs.update(job.id, { ...change, updatedAt: new Date().toISOString() }); await refresh(); }); }
  async function remove(job: Job) {
    if (!window.confirm(`删除“${job.company ? `${job.company} · ` : ''}${job.title}”？`)) return;
    await run(async () => { setDeleted(await deleteJob(job)); if (editing?.id === job.id) setEditing(null); await refresh(); });
  }
  async function undo() { if (deleted) await run(async () => { await restoreJob(deleted); await refresh(); setDeleted(null); }); }
  async function addTask(text: string, jobIds: string[]) { await run(async () => { if (!tasks.some((task) => task.text === text && task.jobIds.join() === jobIds.join())) await database.tasks.put({ id: crypto.randomUUID(), text, jobIds, done: false, order: tasks.length ? Math.max(...tasks.map((task) => task.order)) + 1 : 0, createdAt: new Date().toISOString() }); await refresh(); setMessage('已加入本周准备。'); }); }
  async function moveTask(task: Task, index: number) { if (index < 1) return; await run(async () => { const previous = tasks[index - 1]; await database.transaction('rw', database.tasks, async () => { await database.tasks.update(task.id, { order: previous.order }); await database.tasks.update(previous.id, { order: task.order }); }); await refresh(); }); }
  async function toggleTask(task: Task, done: boolean) {
    setError(''); setMessage('');
    try {
      const saving = saveTaskDone(task.id, done);
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done } : item));
      setSavingTasks((items) => [...items, task.id]);
      await saving; await refresh(); setMessage('任务进展已保存。');
    } catch { setTasks((items) => items.map((item) => item.id === task.id ? task : item)); setError('任务进展未能保存，请重试。'); }
    finally { setSavingTasks((items) => items.filter((id) => id !== task.id)); }
  }
  const visible = jobs.filter((job) => `${job.title} ${job.company}`.toLowerCase().includes(query.toLowerCase()) && (!direction || job.direction === direction) && (!company || job.company === company) && (!status || job.status === status));
  const directions = [...new Set(jobs.map((job) => job.direction).filter(Boolean))] as string[];
  const companies = [...new Set(jobs.map((job) => job.company).filter(Boolean))];
  const filtered = !!(query || direction || company || status);
  const grouped = [...new Set(visible.map((job) => job.direction || '未分类'))].map((name) => [name, visible.filter((job) => (job.direction || '未分类') === name)] as const);

  return <><a href="#workspace-main" className="skip-link">跳到主要内容</a><header className="topbar"><button className="brand brand-button" onClick={() => navigate('jobs')}><span className="brand-icon">J<span /></span><span>岗位探索<span className="brand-caption">求职准备工作台</span></span></button><div className="top-actions"><span className="save-location"><span className="saved-dot" />资料保存在此浏览器</span><button className="primary" onClick={() => navigate('import')}><Icon name="plus" size={17} />新增JD</button><DataBackup refresh={refresh} /></div></header>
    <div className="app-shell"><aside className="sidebar"><div className="nav-caption">我的工作台</div><nav aria-label="主要导航">{nav.map(([key, label]) => <button key={key} aria-label={label} aria-current={page === key || (key === 'jobs' && ['detail', 'import'].includes(page)) ? 'page' : undefined} className={page === key || (key === 'jobs' && ['detail', 'import'].includes(page)) ? 'active' : ''} onClick={() => navigate(key)}><Icon name={key} /><span>{label}</span>{key === 'jobs' && !!jobs.length && <small>{jobs.length}</small>}</button>)}</nav><div className="sidebar-note"><span className="sidebar-note-mark">每一次准备，都更进一步</span><p>了解机会，整理经历，<br />练习把自己讲清楚。</p><span className="muted">{projects.filter((project) => project.confirmed).length}个项目已确认</span></div></aside>
    <main className="app-main" id="workspace-main">{error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice toast" role="status"><span>{message}</span><button className="text-button" aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}{deleted && <div className="notice" role="status">已删除“{deleted.job.title}”<button className="text-button" onClick={undo}>撤销</button><button className="text-button" onClick={() => setDeleted(null)}>关闭</button></div>}
      {page === 'import' && <><button className="text-button back-button" onClick={() => navigate(selected ? 'detail' : 'jobs')}>返回{selected ? '岗位详情' : '岗位清单'}</button><JobImporter key={editing?.id || 'new'} ready={ready} editing={editing} onCancel={() => navigate(selected ? 'detail' : 'jobs')} onOpen={open} onSaved={async (job) => { await refresh(); setSelectedId(job.id); setEditing(null); setPage('detail'); setMessage('岗位已保存，开始了解公司与业务。'); window.scrollTo({ top: 0 }); }} /></>}
      {page === 'jobs' && <div className="page-stack"><div className="dashboard-heading"><div><p className="eyebrow">我的求职准备</p><h1>为下一次机会，做好准备。</h1><p className="muted">从读懂一份JD，到有准备地讲出你的经历。</p></div><span className="today-label">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span></div>
        <section className="dashboard-hero"><div className="hero-content"><span className="hero-kicker">{jobs.length ? '继续你的准备' : '从一个机会开始'}</span><h2>{jobs.length ? `${jobs[0].company || '目标公司'} · ${jobs[0].title}` : '一份岗位，串起完整的求职准备。'}</h2><p>{jobs.length ? jobs[0].nextAction || '了解业务背景、选好主讲项目，再把回答练习一遍。' : '发来岗位链接或截图，逐步了解公司业务、挑选项目，练习真实的工作问题。'}</p><button className="hero-button" disabled={!ready} onClick={() => jobs.length ? open(jobs[0]) : navigate('import')}>{jobs.length ? '继续准备这个岗位' : '添加我的第一个岗位'}<Icon name="arrow" size={18} /></button></div><div className="hero-journey" aria-label="准备路线">{[['01', '读懂岗位', '从JD提取职责与要求'], ['02', '了解公司', '找到业务与岗位的联系'], ['03', '讲好经历', '项目准备与面试练习']].map(([number, title, text]) => <div key={number}><span>{number}</span><div><strong>{title}</strong><small>{text}</small></div></div>)}</div></section>
        <div className="workspace-stats"><div><Icon name="jobs" /><span>关注的机会<strong>{jobs.filter((job) => job.status !== '已结束').length}</strong></span></div><div><Icon name="globe" /><span>已研究公司岗位<strong>{researched.filter((id) => jobs.some((job) => job.id === id)).length}</strong></span></div><div><Icon name="projects" /><span>可用项目<strong>{projects.filter((project) => project.confirmed).length}</strong></span></div><div><Icon name="check" /><span>已完成准备事项<strong>{tasks.filter((task) => task.done).length}<small> / {tasks.length}</small></strong></span></div></div>
        {tasks.length > 0 && <section className="panel"><div className="section-heading"><h2>本周准备</h2><span className="muted">已完成 {tasks.filter((task) => task.done).length}/{tasks.length}</span></div>{tasks.map((task, index) => <div className="task-row" key={task.id}><label className="inline"><input type="checkbox" checked={task.done} disabled={savingTasks.includes(task.id)} onChange={(event) => toggleTask(task, event.target.checked)} /><span className={task.done ? 'completed' : ''}>{displayProjectText(task.text, projects)}{savingTasks.includes(task.id) && <small role="status">正在保存…</small>}<small>{task.jobIds.map((id) => jobs.find((job) => job.id === id)).filter(Boolean).map((job) => `${job!.company} ${job!.title}`).join('、')}</small></span></label><div><button className="text-button" disabled={index === 0 || !!savingTasks.length} onClick={() => moveTask(task, index)}>前移</button><button className="text-button" disabled={savingTasks.includes(task.id)} onClick={() => run(async () => { await database.tasks.delete(task.id); await refresh(); })}>移除</button></div></div>)}</section>}
        <div className="status-strip">{statuses.map((item) => <button key={item} aria-pressed={status === item} onClick={() => setStatus(status === item ? '' : item)}>{item}<strong>{jobs.filter((job) => job.status === item).length}</strong></button>)}</div>
        <section aria-labelledby="jobs-heading"><div className="list-heading"><h2 id="jobs-heading">岗位清单 <span className="count">{jobs.length}</span></h2><div className="list-tools"><div className="view-toggle" aria-label="岗位显示方式"><button aria-pressed={!listView} onClick={() => setListView(false)}>卡片</button><button aria-pressed={listView} onClick={() => setListView(true)}>列表</button></div><button className="text-button" disabled={!ready} onClick={() => run(async () => { await database.jobs.bulkPut(sampleJobs().filter((job) => !jobs.some((current) => current.id === job.id))); await database.sources.bulkPut(sampleSources().filter((source) => !sources.some((current) => current.id === source.id))); await refresh(); })}>体验6个示例岗位</button></div></div>
        <div className="filter-bar"><input type="search" aria-label="搜索岗位或公司" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位或公司" /><select aria-label="按岗位方向筛选" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">全部方向</option>{directions.map((direction) => <option key={direction}>{direction}</option>)}</select><select aria-label="按公司筛选" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">全部公司</option>{companies.map((company) => <option key={company}>{company}</option>)}</select><select aria-label="按投递状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>{filtered && <button className="text-button" onClick={() => { setQuery(''); setDirection(''); setCompany(''); setStatus(''); }}>清除筛选</button>}</div>
        {!ready && !error && <p role="status">正在读取岗位记录…</p>}{ready && !visible.length && <div className="panel empty"><span className="empty-mark">＋</span><h3>{filtered ? '没有找到相关岗位' : '从一个感兴趣的岗位开始'}</h3><p>{filtered ? '调整筛选或清除筛选，再看看其他机会。' : '提供招聘链接或JD截图，自动整理岗位内容。'}</p>{!filtered && <button className="primary" onClick={() => navigate('import')}>添加第一条JD</button>}</div>}
        <div className={`job-grid ${listView ? 'as-list' : ''}`}>{grouped.flatMap(([name, records]) => [<h3 className="group-heading" key={`group-${name}`}>{name} <span className="count">{records.length}</span></h3>, ...records.map((job) => <article className="panel job clickable-card" key={job.id} tabIndex={0} onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,select,textarea,a,summary,details,label')) open(job); }} onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) open(job); }}>
          <div className="job-heading"><div className="job-identity"><span className="company-avatar">{(job.company || 'JD').slice(0, 1)}</span><div><p className="company">{job.company || '公司待补充'} {job.sample ? '· 示例岗位' : ''}</p><h3><button className="title-button" onClick={() => open(job)}>{job.title}</button></h3></div></div><select aria-label={`${job.title}投递状态`} value={job.status} onChange={(event) => update(job, { status: event.target.value as JobStatus, statusHistory: [...(job.statusHistory || []), { status: event.target.value as JobStatus, at: new Date().toISOString() }] })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>
          <p className="muted">{[job.direction || '方向待补充', job.location, job.hiringType].filter(Boolean).join(' · ')}</p>{job.warnings?.length ? <span className="tag">待核对或补充</span> : null}<ul className="job-priorities">{[...(job.requirements || []), ...(job.responsibilities || [])].slice(0, 2).map((item) => <li key={item.id}>{item.text}</li>)}</ul><label className="next-action">下一步行动<input key={`${job.id}-${job.nextAction}`} defaultValue={job.nextAction} maxLength={300} placeholder="例如：整理一个需求分析项目" onBlur={(event) => { if (event.target.value !== job.nextAction) void update(job, { nextAction: event.target.value }); }} /></label><div className="job-footer"><span>更新于 {new Date(job.updatedAt).toLocaleDateString('zh-CN')}</span><div><button className="text-button" onClick={() => edit(job)}>编辑</button><button className="text-button danger" onClick={() => remove(job)}>删除</button></div></div>
        </article>)])}</div></section>
      </div>}
      {page === 'projects' && <>{resumeProjects && selected && <div className="context-banner"><span>正在为 {selected.company} · {selected.title} 整理经历</span><button className="text-button" onClick={() => navigate('detail')}>返回岗位继续准备 <Icon name="arrow" size={15} /></button></div>}<Projects projects={projects} refresh={refresh} onDeleted={() => setDeleted(null)} /></>}
      {page === 'detail' && selected && <><button className="text-button back-button" onClick={() => navigate('jobs')}>返回岗位清单</button><JobDetail key={selected.id} initialTab={resumeProjects ? 'projects' : 'understand'} job={selected} projects={projects} sources={sources} refresh={refresh} onEdit={edit} onProjects={() => { setResumeProjects(true); navigate('projects'); }} onPractice={(mode, id) => { setSelectedId(id); navigate(mode); }} addTask={addTask} /></>}
      {page === 'compare' && <Comparison jobs={jobs} projects={projects} sources={sources} addTask={addTask} />}
      {(page === 'interview' || page === 'scenario') && <><label className="practice-selector">选择目标岗位<select value={practiceJob?.id || ''} onChange={(event) => setSelectedId(event.target.value)}><option value="" disabled>请选择岗位</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.company} · {job.title}</option>)}</select></label>{practiceJob ? <Practice key={`${page}-${practiceJob.id}`} job={practiceJob} mode={page} sources={sources} addTask={addTask} refresh={refresh} /> : <div className="panel empty"><h2>先添加一个目标岗位</h2><p>面试题和工作情境会结合该岗位的职责与要求。</p><button className="primary" onClick={() => navigate('import')}>新增JD</button></div>}</>}
    </main></div>
  </>;
}

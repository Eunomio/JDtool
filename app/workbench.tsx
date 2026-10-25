'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import TutorialWorkspace from './tutorial-workspace';
import Onboarding, { tutorialSteps, useOnboarding, type TutorialStep } from './onboarding';
import type { AccountUser } from '../lib/account-types';
import type { AccountSync } from '../lib/account-sync';
import MobileNavigation from './mobile-navigation';
import HomeHub from './home-hub';
import ProductAssistant from './product-assistant';
import RequestIndicator from './async-status';
import { database, statuses, type Job, type JobStatus, type Project, type Source, type Task, type PreparationResult, type SavedResult, type PracticeSession } from '../lib/database';
import { sampleJobs, sampleSources } from '../lib/samples';
import JobImporter from './job-importer';
import Projects from './projects';
import JobDetail from './job-detail';
import Comparison from './comparison';
import Practice, { PracticeSelector } from './practice';
import DataBackup from './data-backup';
import { saveTaskDone, recoverTaskChanges } from '../lib/task-storage';
import { displayProjectText } from '../lib/client';
import { deleteJob, restoreJob, type DeletedJob } from '../lib/job-storage';
import { Icon } from './ui';
import { categoryFor } from '../lib/role-taxonomy';
import { inputVersion } from '../lib/client';
import { needsRoleClassification, normalizeStoredHiringTypes } from '../lib/role-storage';
import { useRoleClassification } from './use-role-classification';

type Page = 'home' | 'jobs' | 'import' | 'detail' | 'projects' | 'compare' | 'interview' | 'scenario';
const nav = [['home', '首页'], ['jobs', '岗位清单'], ['detail', '岗位详情'], ['projects', '我的项目'], ['compare', '岗位比较'], ['interview', '模拟面试'], ['scenario', '岗位体验']] as const;
function pageFromHash(hash: string): Page { return hash === 'categories' ? 'jobs' : [...nav.map(([key]) => key), 'import'].includes(hash) ? hash as Page : 'home'; }
const journey = [{ title: '岗位解析', icon: 'globe' }, { title: '整理经历', icon: 'projects' }, { title: '面试准备', icon: 'interview' }, { title: '实战练习', icon: 'target' }];

export default function Workbench({ account, sync, onLogout }: { account: AccountUser; sync: AccountSync; onLogout: () => Promise<void> }) {
  const saveStatus = useSyncExternalStore(sync.subscribe, sync.getStatus, sync.getStatus);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preparationCards, setPreparationCards] = useState<SavedResult<PreparationResult>[]>([]);
  const [practiceRecords, setPracticeRecords] = useState<PracticeSession[]>([]);
  const [savingTasks, setSavingTasks] = useState<string[]>([]);
  const [page, setPage] = useState<Page>(() => pageFromHash(typeof window === 'undefined' ? '' : window.location.hash.slice(1)));
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem(`jdtool-last-job:${account.id}`) || '');
  const [ready, setReady] = useState(false);
  const [practiceReview, setPracticeReview] = useState(false);
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
  const [detailStage, setDetailStage] = useState<'understand' | 'projects' | 'prepare'>('understand');
  const [milestones, setMilestones] = useState<Record<string, boolean[]>>({});
  const tutorial = useOnboarding(account.id, ready, () => navigate('home'));

  function showTutorialStep(step: TutorialStep) {
    const pages: Record<TutorialStep, Page> = { add: 'home', input: 'import', review: 'import', requirements: 'detail', category: 'detail', company: 'detail', projects: 'projects', match: 'detail', preparation: 'detail', practice: 'detail', interview: 'interview', scenario: 'scenario', plan: 'home' };
    tutorial.go(step); navigate(pages[step]);
  }
  function finishTutorial(next: Page, completed = false) {
    if (completed) tutorial.complete(); else tutorial.skip();
    navigate(next);
  }
  function nextTutorialStep() {
    const index = tutorialSteps.findIndex(item => item.id === tutorial.step);
    if (index < 0) return;
    if (tutorial.step === 'plan') finishTutorial('home', true);
    else showTutorialStep(tutorialSteps[index + 1].id);
  }

  async function refresh() {
    await normalizeStoredHiringTypes();
    const [a, b, c, d, e, f, g, h] = await Promise.all([database.jobs.orderBy('updatedAt').reverse().toArray(), database.projects.toArray(), database.sources.toArray(), database.tasks.orderBy('order').toArray(), database.companies.toArray(), database.recommendations.toArray(), database.preparations.toArray(), database.practice.toArray()]);
    setJobs(a); setProjects(b); setSources(c); setTasks(d.filter((task) => task.jobIds.some((id) => a.some((job) => job.id === id))));
    setPreparationCards(g); setPracticeRecords(h);
    setResearched([...new Set(e.filter((record) => record.data.research).map((record) => record.jobId))]);
    setMilestones(Object.fromEntries(a.map(job => {
      const jobSources = c.filter(source => source.jobId === job.id); const version = inputVersion(job, b.filter(project => project.confirmed), jobSources);
      return [job.id, [!!job.content.trim(), f.some(record => record.jobId === job.id && record.inputVersion === version && record.data.recommendations.length > 0), g.some(record => record.jobId === job.id && record.inputVersion === version), h.some(session => session.jobId === job.id && session.inputVersion === inputVersion(job, [], jobSources) && !!session.data.feedback)]];
    })));
  }
  useEffect(() => { recoverTaskChanges().then(refresh).then(() => setReady(true)).catch(() => setError('无法读取已保存的资料，请检查浏览器是否允许保存网站数据。')); }, []);
  const roleAnalysis = useRoleClassification(jobs, ready && !tutorial.step, refresh);
  useEffect(() => { const cleanHash = () => { if (window.location.hash === '#categories') window.history.replaceState(null, '', '#jobs'); }; const back = () => { cleanHash(); setPage(pageFromHash(window.location.hash.slice(1))); setEditing(null); window.scrollTo({ top: 0 }); }; cleanHash(); window.addEventListener('popstate', back); return () => window.removeEventListener('popstate', back); }, []);
  useEffect(() => { const changed = () => { void refresh(); }; window.addEventListener('jdtool-workspace-updated', changed); return () => window.removeEventListener('jdtool-workspace-updated', changed); }, []);
  useEffect(() => { document.querySelector('nav[aria-label="主要导航"] [aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [page]);
  useEffect(() => { if (!tutorial.step && page === 'detail' && ready && jobs.length && !jobs.some(job => job.id === selectedId)) setSelectedId(jobs[0].id); }, [page, ready, jobs, selectedId, tutorial.step]);
  const selected = jobs.find((job) => job.id === selectedId);
  const practiceJob = selected || jobs[0];
  async function run(action: () => Promise<void>) { setError(''); try { await action(); } catch (error) { setError(error instanceof Error ? error.message : '未能保存更改，请重试。'); } }
  function navigate(next: Page, review = false) { setPracticeReview(review); if (window.location.hash !== `#${next}`) window.history.pushState(null, '', `#${next}`); setPage(next); setEditing(null); setError(''); setMessage(''); window.scrollTo({ top: 0 }); }
  function chooseJob(id: string) { sessionStorage.setItem(`jdtool-last-job:${account.id}`, id); setSelectedId(id); }
  function open(job: Job, stage: 'understand' | 'projects' | 'prepare' = 'understand') { chooseJob(job.id); setResumeProjects(false); setDetailStage(stage); navigate('detail'); }
  function continueStage(job: Job, index: number) { if (index === 3) { chooseJob(job.id); navigate('scenario'); } else open(job, (['understand', 'projects', 'prepare'] as const)[index]); }
  function edit(job: Job) { setEditing(job); chooseJob(job.id); window.history.pushState(null, '', '#import'); setPage('import'); window.scrollTo({ top: 0 }); }
  async function update(job: Job, change: Partial<Job>) { await run(async () => { await database.jobs.update(job.id, { ...change, updatedAt: new Date().toISOString() }); await refresh(); }); }
  async function remove(job: Job) {
    if (!window.confirm(`删除“${job.company ? `${job.company} · ` : ''}${job.title}”？`)) return;
    await run(async () => { setDeleted(await deleteJob(job)); if (editing?.id === job.id) setEditing(null); await refresh(); });
  }
  async function undo() { if (deleted) await run(async () => { await restoreJob(deleted); await refresh(); setDeleted(null); }); }
  async function addTask(text: string, jobIds: string[]) {
    setError('');
    try {
      await database.transaction('rw', database.jobs, database.tasks, async () => {
        if ((await database.jobs.bulkGet(jobIds)).some(job => !job)) throw new Error('关联岗位已移除，请刷新后再添加计划。');
        const current = await database.tasks.toArray();
        if (!current.some(task => task.text === text && [...task.jobIds].sort().join() === [...jobIds].sort().join())) await database.tasks.put({ id: crypto.randomUUID(), text, jobIds, done: false, order: current.length ? Math.max(...current.map(task => task.order)) + 1 : 0, createdAt: new Date().toISOString() });
      });
      await refresh(); setMessage('已加入本周准备。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '未能添加计划，请重试。'); throw cause; }
  }
  async function moveTask(task: Task, index: number) { if (index < 1) return; await run(async () => { const previous = tasks[index - 1]; await database.transaction('rw', database.tasks, async () => { await database.tasks.update(task.id, { order: previous.order }); await database.tasks.update(previous.id, { order: task.order }); }); await refresh(); }); }
  async function toggleTask(task: Task, done: boolean) {
    setError(''); setMessage('');
    try {
      const saving = saveTaskDone(task.id, done);
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, done } : item));
      setSavingTasks((items) => [...items, task.id]);
      await saving; await refresh(); setMessage(done ? '又完成一项准备，下一步更有把握。' : '已恢复为待完成，可以稍后继续。');
    } catch { setTasks((items) => items.map((item) => item.id === task.id ? task : item)); setError('任务进展未能保存，请重试。'); }
    finally { setSavingTasks((items) => items.filter((id) => id !== task.id)); }
  }
  const visible = jobs.filter((job) => `${job.title} ${job.company} ${categoryFor(job).name}`.toLowerCase().includes(query.toLowerCase()) && (!direction || categoryFor(job).id === direction) && (!company || job.company === company) && (!status || job.status === status));
  const directions = [...new Map(jobs.map(job => { const category = categoryFor(job); return [category.id, category]; })).values()];
  const companies = [...new Set(jobs.map((job) => job.company).filter(Boolean))];
  const filtered = !!(query || direction || company || status);
  const grouped = [...new Set(visible.map((job) => categoryFor(job).name))].map((name) => [name, visible.filter((job) => categoryFor(job).name === name)] as const);
  const focusJob = jobs.find(job => job.id === selectedId) || jobs.find(job => job.status !== '已结束' && job.status !== '已获Offer') || jobs[0];
  const focusProgress = focusJob ? milestones[focusJob.id] || [true, false, false, false] : [false, false, false, false];
  const completed = tasks.filter(task => task.done).length;
  const nextIndex = Math.max(0, focusProgress.findIndex(done => !done));

  return <><a href="#workspace-main" className="skip-link">跳到主要内容</a><header className="topbar"><button className="brand brand-button" aria-label="返回首页" onClick={() => tutorial.step ? finishTutorial('home') : navigate('home')}><span className="brand-icon"><Icon name="layers" size={23} /></span><span>岗位探索</span></button><div className="top-actions">{!tutorial.step && <span className="account-save" data-state={saveStatus.state} role="status">{saveStatus.state === 'saved' ? '已保存到账号' : saveStatus.state === 'saving' ? '正在保存…' : '有资料待保存'}</span>}<button data-tour="add-jd" className="primary" onClick={() => tutorial.step ? showTutorialStep('input') : navigate('import')}><Icon name="plus" size={17} />新增JD</button>{!tutorial.step && <DataBackup refresh={refresh} />}<details className="account-menu"><summary aria-label={`账号 ${account.username}`}><span className="account-avatar">{account.username.slice(0, 1).toUpperCase()}</span><span>{account.username}</span></summary><div className="account-menu-body"><p><strong>{account.username}</strong> · {account.role === 'admin' ? '管理员' : '我的账号'}</p><button className="secondary" onClick={onLogout}>退出登录</button></div></details></div></header>
    <div className="app-shell"><aside className="sidebar"><nav aria-label="主要导航">{nav.map(([key, label]) => <button key={key} title={label} aria-label={label} aria-current={page === key ? 'page' : undefined} className={page === key ? 'active' : ''} onClick={() => tutorial.step ? finishTutorial(key) : key === 'detail' && (selected || jobs[0]) ? open(selected || jobs[0], detailStage) : navigate(key)}><Icon name={key} /><span>{label}</span>{key === 'jobs' && !!jobs.length && <small>{jobs.length}</small>}</button>)}</nav></aside>
    <main className={`app-main ${(page === 'interview' || page === 'scenario') && !tutorial.step ? 'practice-page' : ''}`} id="workspace-main">{tutorial.step && <Onboarding step={tutorial.step} paused={tutorial.paused} onNext={nextTutorialStep} onPause={tutorial.pause} onResume={tutorial.resume} onSkip={() => finishTutorial('home')} onRecover={() => showTutorialStep(tutorial.step!)} onBack={tutorialSteps.findIndex(item => item.id === tutorial.step) > 0 ? () => showTutorialStep(tutorialSteps[tutorialSteps.findIndex(item => item.id === tutorial.step) - 1].id) : undefined} />}{tutorial.step ? <TutorialWorkspace key={tutorial.run} step={tutorial.step} onNext={nextTutorialStep} onStepChange={showTutorialStep} onRestart={tutorial.start} /> : <>{error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice toast" role="status"><span>{message}</span><button className="text-button" aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}{deleted && <div className="notice" role="status">已删除“{deleted.job.title}”<button className="text-button" onClick={undo}>撤销</button><button className="text-button" onClick={() => setDeleted(null)}>关闭</button></div>}
      {(saveStatus.state === 'error' || saveStatus.state === 'conflict') && <div className="notice account-sync-notice" role="alert"><span>{saveStatus.message}</span><button className="secondary small" onClick={() => void sync.flush(true).catch(() => {})}>重试保存</button>{saveStatus.state === 'conflict' && <button className="secondary small" onClick={() => { if (window.confirm('建议先通过资料备份导出本页内容。重新读取会使用账号中已保存的资料，继续吗？')) void sync.reload().catch(() => {}); }}>重新读取账号资料</button>}</div>}
      {page !== 'interview' && page !== 'scenario' && roleAnalysis.busy && <div className="notice" role="status"><span className="async-spinner" aria-hidden="true" />正在自动整理岗位类别 {roleAnalysis.completed}/{roleAnalysis.total}<button className="secondary small" onClick={roleAnalysis.stop}>停止分析</button></div>}
      {page !== 'interview' && page !== 'scenario' && jobs.some(needsRoleClassification) && (roleAnalysis.error || !roleAnalysis.busy && roleAnalysis.message) && <div className="notice" role="status" aria-label="岗位类型识别"><span>{roleAnalysis.error || roleAnalysis.message}</span><button className="secondary small" disabled={roleAnalysis.busy} onClick={() => void roleAnalysis.analyze(jobs.filter(needsRoleClassification), false)}>重试自动识别</button></div>}
      {page === 'import' && <><button className="text-button back-button" onClick={() => navigate(selected ? 'detail' : 'jobs')}>返回{selected ? '岗位详情' : '岗位清单'}</button><JobImporter key={editing?.id || 'new'} ready={ready} editing={editing} onCancel={() => navigate(selected ? 'detail' : 'jobs')} onOpen={open} onSaved={async (job) => { await refresh(); chooseJob(job.id); setEditing(null); setDetailStage('understand'); setResumeProjects(false); navigate('detail'); setMessage('岗位已保存，开始了解公司与业务。'); window.scrollTo({ top: 0 }); }} /></>}
      {(page === 'home' || page === 'jobs') && <div className="page-stack">{page === 'home' && <><div className="dashboard-heading"><div><h1>把机会，变成下一步。</h1></div><button data-tour-launch className="secondary tutorial-launch" disabled={!ready} onClick={tutorial.start}><Icon name="sparkles" size={17} />新手教程</button></div>
        <div id="home-assistant-entry" /><HomeHub jobs={jobs} projects={projects} sources={sources} tasks={tasks} cards={preparationCards} practice={practiceRecords} savingTasks={savingTasks} onToggle={toggleTask} onRemove={task => void run(async () => { await database.tasks.delete(task.id); await refresh(); })} onOpen={open} onPractice={(job, mode) => { chooseJob(job.id); navigate(mode, true); }} onAdd={() => navigate('import')} onJobs={() => navigate('jobs')} />
        <section className="panel home-opportunities"><div className="section-heading"><div><h2>最近关注的岗位</h2></div><button className="secondary small home-list-link" onClick={() => navigate('jobs')}>查看全部岗位 <Icon name="arrow" size={14} /></button></div>{jobs.slice(0, 4).map(job => <button className="home-opportunity" key={job.id} onClick={() => open(job)}><span className="company-avatar">{(job.company || 'JD').slice(0, 1)}</span><span><strong>{job.title}</strong><small>{job.company || '公司待补充'} · {categoryFor(job).name}</small></span><span className="tag">{job.status}</span><Icon name="chevron" size={15} /></button>)}{!jobs.length && <div className="empty"><h3>从一个感兴趣的岗位开始</h3><button className="primary" disabled={!ready} onClick={() => navigate('import')}>添加第一条JD</button></div>}{account.role === 'admin' && <button className="text-button" disabled={!ready} onClick={() => navigate('jobs')}>查看演示岗位与项目</button>}</section>
        <details className="home-progress" open={!jobs.length}><summary>当前岗位与准备进展</summary><div className="page-stack">
        <section className="dashboard-hero"><div className="hero-content"><h2>{focusJob ? focusJob.title : <>下一份理想工作，<br />从读懂一个机会开始。</>}</h2>{focusJob && <p className="hero-company">{`${focusJob.company || '目标公司'} · ${categoryFor(focusJob).name}`}</p>}{focusJob?.nextAction && <p>{focusJob.nextAction}</p>}<div className="actions"><button className="hero-button" disabled={!ready} onClick={() => focusJob ? continueStage(focusJob, nextIndex) : navigate('import')}>{focusJob ? '继续准备这个岗位' : '添加我的第一个岗位'}<Icon name="arrow" size={18} /></button></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="orbit-core"><Icon name="target" size={44} /><strong>{focusJob ? `${focusProgress.filter(Boolean).length}/4` : 'START'}</strong></div><span className="orbit-satellite satellite-one"><Icon name="globe" size={19} /></span><span className="orbit-satellite satellite-two"><Icon name="projects" size={20} /></span><span className="orbit-satellite satellite-three"><Icon name="sparkles" size={18} /></span></div></section>
        <section className="journey-board" aria-label="准备路线">{journey.map((step, index) => <button key={step.title} className={`journey-stop ${focusProgress[index] ? 'done' : ''} ${focusJob && index === nextIndex ? 'next' : ''}`} disabled={!ready} onClick={() => focusJob ? continueStage(focusJob, index) : navigate('import')}><span className="journey-node">{focusProgress[index] ? <Icon name="check" size={21} /> : <Icon name={step.icon} size={21} />}</span><span><strong>{step.title}</strong></span><Icon name="chevron" size={16} /></button>)}</section>
        <div className="workspace-stats"><div><Icon name="jobs" /><span>关注的机会<strong>{jobs.filter((job) => job.status !== '已结束').length}</strong></span></div><div><Icon name="globe" /><span>已研究公司岗位<strong>{researched.filter((id) => jobs.some((job) => job.id === id)).length}</strong></span></div><div><Icon name="projects" /><span>可用项目<strong>{projects.filter((project) => project.confirmed).length}</strong></span></div><div><Icon name="check" /><span>已完成准备事项<strong>{tasks.filter((task) => task.done).length}<small> / {tasks.length}</small></strong></span></div></div></div></details></>}
        {page === 'jobs' && <header className="page-title jobs-page-heading"><div><h1 aria-label="岗位清单">岗位清单<span className="count" aria-hidden="true">{jobs.length}</span></h1></div></header>}
        {page === 'jobs' && <div className="dashboard-layout"><aside data-tour="weekly-plan" className="plan-panel panel"><div className="section-heading"><div><h2>本周准备</h2></div><span className="icon-tile"><Icon name="flag" size={20} /></span></div><div className="plan-progress"><strong>{completed}<small> / {tasks.length}</small></strong><span>准备事项已完成</span><progress value={completed} max={Math.max(1, tasks.length)} /></div>{!tasks.length && <div className="plan-empty"><Icon name="check" size={24} /><h3>给下一步留个位置</h3><button className="secondary" disabled={!ready} onClick={() => focusJob ? open(focusJob) : navigate('import')}>{focusJob ? '去发现准备重点' : '先添加一个岗位'}<Icon name="arrow" size={15} /></button></div>}{tasks.map((task, index) => <div className={`task-row ${task.done ? 'task-done' : ''}`} key={task.id}><label className="inline"><input type="checkbox" checked={task.done} disabled={savingTasks.includes(task.id)} onChange={(event) => toggleTask(task, event.target.checked)} /><span className={task.done ? 'completed' : ''}>{displayProjectText(task.text, projects)}{savingTasks.includes(task.id) && <small role="status">正在保存…</small>}<small>{task.jobIds.map((id) => jobs.find((job) => job.id === id)).filter(Boolean).map((job) => `${job!.company} ${job!.title}`).join('、')}</small></span></label><div><button className="text-button" disabled={index === 0 || !!savingTasks.length} onClick={() => moveTask(task, index)}>前移</button><button className="text-button" disabled={savingTasks.includes(task.id)} onClick={() => run(async () => { await database.tasks.delete(task.id); await refresh(); })}>移除</button></div></div>)}</aside><div className="opportunity-board">{<>
        <div className="status-strip">{statuses.map((item) => <button key={item} aria-pressed={status === item} onClick={() => setStatus(status === item ? '' : item)}>{item}<strong>{jobs.filter((job) => job.status === item).length}</strong></button>)}</div>
        <section aria-labelledby="jobs-heading"><div className="list-heading"><div><h2 id="jobs-heading">全部岗位 <span className="count">{jobs.length}</span></h2></div><div className="list-tools"><div className="view-toggle" aria-label="岗位显示方式"><button aria-pressed={!listView} onClick={() => setListView(false)}>卡片</button><button aria-pressed={listView} onClick={() => setListView(true)}>列表</button></div></div></div>
        {account.role === 'admin' && <div className="category-toolbar"><button className="text-button" disabled={!ready} onClick={() => run(async () => { await database.jobs.bulkPut(sampleJobs().filter((job) => !jobs.some((current) => current.id === job.id))); await database.sources.bulkPut(sampleSources().filter((source) => !sources.some((current) => current.id === source.id))); await refresh(); })}>体验6个示例岗位</button></div>}
        <div className="filter-bar"><input type="search" aria-label="搜索岗位或公司" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索岗位、公司或职位类别" /><select aria-label="按职位大类筛选" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="">全部类别</option>{directions.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select aria-label="按公司筛选" value={company} onChange={(event) => setCompany(event.target.value)}><option value="">全部公司</option>{companies.map((company) => <option key={company}>{company}</option>)}</select><select aria-label="按投递状态筛选" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select>{filtered && <button className="text-button" onClick={() => { setQuery(''); setDirection(''); setCompany(''); setStatus(''); }}>清除筛选</button>}</div>
        {!ready && !error && <p role="status">正在读取岗位记录…</p>}{ready && !visible.length && <div className="panel empty"><span className="empty-mark">＋</span><h3>{filtered ? '没有找到相关岗位' : '从一个感兴趣的岗位开始'}</h3>{!filtered && <button className="primary" onClick={() => navigate('import')}>添加第一条JD</button>}</div>}
        <div className={`job-grid ${listView ? 'as-list' : ''}`}>{grouped.flatMap(([name, records]) => [<h3 className="group-heading" key={`group-${name}`}>{name} <span className="count">{records.length}</span></h3>, ...records.map((job) => <article className="panel job clickable-card" key={job.id} tabIndex={0} onClick={(event) => { if (!(event.target as HTMLElement).closest('button,input,select,textarea,a,summary,details,label')) open(job); }} onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) open(job); }}>
          <div className="job-heading"><div className="job-identity"><span className="company-avatar">{(job.company || 'JD').slice(0, 1)}</span><div><p className="company">{job.company || '公司待补充'} {job.sample ? '· 示例岗位' : ''}</p><h3><button className="title-button" onClick={() => open(job)}>{job.title}</button></h3></div></div><select aria-label={`${job.title}投递状态`} value={job.status} onChange={(event) => update(job, { status: event.target.value as JobStatus, statusHistory: [...(job.statusHistory || []), { status: event.target.value as JobStatus, at: new Date().toISOString() }] })}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>
          <div className="job-tags"><span className={`category-badge ${categoryFor(job).id === 'undetermined' ? 'pending' : ''}`}>{categoryFor(job).name}</span><span className="muted">{[job.location, job.hiringType].filter(Boolean).join(' · ')}</span>{job.warnings?.length ? <span className="tag">待核对或补充</span> : null}</div><ul className="job-priorities">{[...(job.requirements || []), ...(job.responsibilities || [])].slice(0, 2).map((item) => <li key={item.id}>{item.text}</li>)}</ul><div className="card-milestones" aria-label={`${job.title}准备进度`}>{journey.map((step, index) => <span key={step.title} className={milestones[job.id]?.[index] ? 'done' : ''} title={step.title}>{milestones[job.id]?.[index] ? <Icon name="check" size={12} /> : <span />}{step.title}</span>)}</div><label className="next-action">下一步行动<input key={`${job.id}-${job.nextAction}`} defaultValue={job.nextAction} maxLength={300} placeholder="记下一个可以完成的小步骤" onBlur={(event) => { if (event.target.value !== job.nextAction) void update(job, { nextAction: event.target.value }); }} /></label><div className="job-footer"><button className="card-open-button" onClick={() => open(job)}>继续准备 <Icon name="arrow" size={15} /></button><div><button className="text-button" onClick={() => edit(job)}>编辑</button><button className="text-button danger" onClick={() => remove(job)}>删除</button></div></div>
        </article>)])}</div></section></>}</div></div>}
      </div>}
      {page === 'projects' && <>{resumeProjects && selected && <div className="context-banner"><span>正在为 {selected.company} · {selected.title} 整理经历</span><button className="text-button" onClick={() => navigate('detail')}>返回岗位继续准备 <Icon name="arrow" size={15} /></button></div>}<Projects allowSamples={account.role === 'admin'} projects={projects} refresh={refresh} onDeleted={() => setDeleted(null)} /></>}
      {page === 'detail' && !selected && <section className="panel empty"><h1>岗位详情</h1><button className="primary" onClick={() => navigate('import')}>添加我的第一个岗位</button></section>}
      {page === 'detail' && selected && <><label className="practice-selector">当前岗位<select aria-label="当前岗位" value={selected.id} onChange={event => { const job = jobs.find(row => row.id === event.target.value); if (job) open(job); }}>{jobs.map(job => <option key={job.id} value={job.id}>{job.company} · {job.title}</option>)}</select></label><button className="text-button back-button" onClick={() => navigate('jobs')}>返回岗位清单</button><JobDetail key={`${selected.id}-${detailStage}`} initialTab={resumeProjects ? 'projects' : detailStage} job={selected} projects={projects} sources={sources} refresh={refresh} onEdit={edit} onRecognize={job => void roleAnalysis.analyze([job], false)} onProjects={() => { setResumeProjects(true); navigate('projects'); }} onPractice={(mode, id) => { chooseJob(id); navigate(mode); }} addTask={addTask} /></>}
      {page === 'compare' && <Comparison jobs={jobs} projects={projects} sources={sources} addTask={addTask} ready={ready} />}
      {(page === 'interview' || page === 'scenario') && <><PracticeSelector jobs={jobs} selectedId={practiceJob?.id || ''} onSelect={chooseJob} />{practiceJob ? <Practice key={`${page}-${practiceJob.id}`} job={practiceJob} mode={page} sources={sources} addTask={addTask} refresh={refresh} openReview={practiceReview} onExit={() => navigate('home')} /> : <div className="panel empty"><h2>先添加一个目标岗位</h2><button className="primary" onClick={() => navigate('import')}>新增JD</button></div>}</>}
    </>}</main></div><MobileNavigation page={page === 'import' && editing ? 'detail' : page} onNavigate={next => tutorial.step ? finishTutorial(next) : next === 'detail' && (selected || jobs[0]) ? open(selected || jobs[0], detailStage) : navigate(next)} />
    {!tutorial.step && <ProductAssistant accountId={account.id} page={page} jobs={jobs} selectedJobId={(page === 'interview' || page === 'scenario') ? practiceJob?.id : page === 'home' ? focusJob?.id : selected?.id} beforeSend={() => sync.flush()} />}
    {!tutorial.step && page !== 'interview' && page !== 'scenario' && <RequestIndicator />}
  </>;
}

'use client';
import VoiceTextarea from './voice-textarea';
import { useEffect, useRef, useState } from 'react';
import { database, type Job, type Project, type RecommendationResult, type SavedResult, type Source } from '../lib/database';
import { api, copyText, displayText, displayProjectText, inputVersion, modelProjects } from '../lib/client';
import { saveProjectResult, updateRecommendationBullet } from '../lib/project-storage';
import { Evidence } from './evidence';
import { ProjectMatchBadge, ProjectMatchSummary } from './project-match';

export default function ProjectBuilder({ job, projects, sources }: { job: Job; projects: Project[]; sources: Source[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedResult<RecommendationResult> | null>(null);
  const [history, setHistory] = useState<SavedResult<RecommendationResult>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const changeSequence = useRef(0);
  const confirmed = projects.filter((project) => project.confirmed);
  const version = inputVersion(job, confirmed, sources);
  const projectVersions = projects.map((project) => `${project.id}:${project.updatedAt}`).join('|');
  useEffect(() => { let cancelled = false; database.recommendations.where('jobId').equals(job.id).sortBy('createdAt').then((items) => { if (cancelled) return; setHistory(items.reverse()); setSaved(items[0] || null); setSelected(items[0]?.data.recommendations.map((recommendation) => recommendation.projectId).filter((id) => projects.some((project) => project.id === id)) || []); }); return () => { cancelled = true; }; }, [job.id, projectVersions]);

  async function generate() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await api<RecommendationResult>('/api/project-recommendations', { job, projects: modelProjects(confirmed), sources, preference: selected, maxProjects: 3, outputModes: ['resume_bullets', 'interview_outline'] });
      if (!data.recommendations.length || !data.recommendations.some(item => item.resumeBullets.length || item.interviewOutline.length)) throw new Error('尚未找到有事实支撑的项目表述，请补充并核对项目事实后重试。');
      const result = { id: crypto.randomUUID(), jobId: job.id, inputVersion: version, data, createdAt: new Date().toISOString() };
      await saveProjectResult('recommendations', result, confirmed); setSaved(result); setHistory((items) => [result, ...items]); setSelected(data.recommendations.map((item) => item.projectId));
    } catch (error) { setError(error instanceof Error ? error.message : '本次未完成，请重试。'); }
    finally { setBusy(false); }
  }

  async function changeBullet(recIndex: number, key: 'resumeBullets' | 'interviewOutline', index: number, change: { text?: string; adopted?: boolean }) {
    if (!saved) return;
    const project = projects.find((project) => project.id === saved.data.recommendations[recIndex].projectId);
    if (!project) { setError('原项目已删除，请重新选择项目。'); return; }
    const sequence = ++changeSequence.current;
    const data = structuredClone(saved.data);
    Object.assign(data.recommendations[recIndex][key][index], change);
    if (change.text !== undefined) data.recommendations[recIndex][key][index].adopted = false;
    const next = { ...saved, data };
    setSaved(next); setError(''); setMessage('正在保存表述…');
    try {
      const stored = await updateRecommendationBullet(saved.id, project, key, index, change);
      if (changeSequence.current === sequence) { setSaved(stored); setHistory((items) => items.map((item) => item.id === stored.id ? stored : item)); setMessage('表述已保存。'); }
    } catch (error) { if (changeSequence.current === sequence) { setError(error instanceof Error ? error.message : '表述未能保存，请重试。'); setMessage(''); } }
  }

  async function copy() {
    if (!saved) return;
    setError(''); setMessage('');
    try {
      const current = await database.transaction('r', database.projects, database.recommendations, async () => ({ projects: await database.projects.toArray(), record: await database.recommendations.get(saved.id) }));
      const bullets = current.record?.data.recommendations.flatMap((recommendation) => {
        const project = current.projects.find((project) => project.id === recommendation.projectId);
        if (!project?.confirmed) return [];
        const lines = [...recommendation.resumeBullets, ...recommendation.interviewOutline].filter((item) => item.adopted && item.factIds.length && item.factIds.every((id) => project.facts.some((fact) => fact.id === id))).map((item) => displayProjectText(item.text, current.projects));
        return lines.length ? [displayProjectText(project.name, current.projects), ...lines] : [];
      }) || [];
      if (!bullets.length) throw new Error('请先核对当前项目事实，并采用需要复制的表述。');
      await copyText(bullets.join('\n')); setMessage('已复制采用的表述。');
    } catch (error) { setError(error instanceof Error ? error.message : '复制未完成，请重试。'); }
  }

  async function manual() {
    setError('');
    if (!selected.some(id => confirmed.find(project => project.id === id)?.facts.some(fact => fact.text.trim()))) { setError('请先补充并核对至少一条项目事实，再组装表述。'); return; }
    const data: RecommendationResult = { recommendations: selected.filter((id) => confirmed.some((project) => project.id === id)).map((id, index) => {
      const project = confirmed.find((project) => project.id === id)!;
      return { projectId: id, rank: index + 1, role: index === 0 ? 'primary' : 'supporting', matchType: 'needs_more', requirementIds: [], factIds: project.facts.map((fact) => fact.id), reason: '按你选择的讲述顺序整理，请结合JD核对与调整。', resumeBullets: project.facts.map((fact) => ({ text: displayText(fact.text, project), factIds: [fact.id] })), interviewOutline: [] };
    }), gaps: [], needsReview: [] };
    const record = { id: crypto.randomUUID(), jobId: job.id, inputVersion: version, createdAt: new Date().toISOString(), data };
    try { await saveProjectResult('recommendations', record, confirmed.filter((project) => selected.includes(project.id))); setSaved(record); setHistory((items) => [record, ...items]); }
    catch (error) { setError(error instanceof Error ? error.message : '未能保存，请重试。'); }
  }

  return <section data-tour="project-builder" className="panel builder"><div className="section-heading"><div><h2>按岗位组装项目</h2></div><button className="primary" onClick={generate} disabled={busy || !confirmed.length}>{busy ? '正在匹配并改写…' : saved ? '重新推荐与改写' : 'AI推荐项目'}</button></div>
    <p className="privacy-note">仅将已确认项目的事实及所选岗位用于本次推荐；可展示项目先应用脱敏替换。</p><button className="text-button" disabled={!selected.length || busy} onClick={manual}>用所选原始事实手动组装</button>
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}{saved && saved.inputVersion !== version && <div className="notice">岗位或项目资料已更新，以下为旧版，可重新生成。</div>}
    <ProjectMatchSummary job={job} projects={projects} recommendations={saved?.data.recommendations.filter(item => selected.includes(item.projectId)) || []} stale={!!saved && saved.inputVersion !== version} /><div className="builder-columns"><div><h3>1. JD要求</h3>{[...(job.requirements || []), ...(job.responsibilities || [])].map((item) => <blockquote key={item.id}><strong>{item.text}</strong><p className="muted">{item.sourceText || item.text}</p></blockquote>)}</div>
      <div><h3>2. 候选项目</h3><p className="muted">最多选3个，第一个为主讲项目。</p>{!confirmed.length && <p>先在“我的项目”中核对项目事实，也可先手动添加真实项目。</p>}{confirmed.map((project) => <div key={project.id} className="candidate"><label className="inline"><input type="checkbox" checked={selected.includes(project.id)} disabled={!selected.includes(project.id) && selected.length >= 3} onChange={(event) => setSelected((items) => event.target.checked ? [...items, project.id] : items.filter((id) => id !== project.id))} />{displayText(project.name, project)}</label><ProjectMatchBadge job={job} projects={projects} recommendation={saved?.data.recommendations.find(item => item.projectId === project.id)} stale={!!saved && saved.inputVersion !== version} /><p className="muted">{project.stage} · {project.sources.map((source) => displayProjectText(source.label, projects)).join('、')}</p><details><summary>原始事实</summary>{project.facts.map((fact) => <p key={fact.id}>{displayText(fact.text, project)}</p>)}</details></div>)}{selected.length > 0 && <div><h4>讲述顺序</h4>{selected.map((id, index) => <div key={id}>{index === 0 ? '主讲' : '辅助'}：{displayProjectText(projects.find((project) => project.id === id)?.name || '', projects)}<button className="text-button" disabled={index === 0} onClick={() => setSelected((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>前移</button></div>)}</div>}</div>
      <div><h3>3. 岗位版表述</h3>{!saved && <p className="builder-empty">选择已核对的项目后，点击“AI推荐项目”，生成简历要点与面试提纲。</p>}{saved?.data.recommendations.map((recommendation, recIndex) => {
        const project = projects.find((project) => project.id === recommendation.projectId);
        return <article className="generated-project" key={recommendation.projectId}><h4>{project ? displayText(project.name, project) : '项目已删除'}</h4><ProjectMatchBadge job={job} projects={projects} recommendation={recommendation} stale={!!saved && saved.inputVersion !== version} /><span className="tag">{recommendation.role === 'primary' ? '主讲' : '辅助'} · {{ direct: '直接相关', transferable: '方法可迁移', needs_more: '需要补充' }[recommendation.matchType]}</span><p>{displayProjectText(recommendation.reason, projects)}</p><Evidence item={{ requirementIds: recommendation.requirementIds, factIds: recommendation.factIds, sourceIds: [] }} jobs={[job]} projects={projects} sources={sources} />{(['resumeBullets', 'interviewOutline'] as const).map((key) => <section key={key}><h4>{key === 'resumeBullets' ? '简历要点' : '面试提纲'}</h4>{!recommendation[key].length && <p className="builder-empty">这份记录尚未保存{key === 'resumeBullets' ? '简历要点' : '面试提纲'}，可点击“重新推荐与改写”补全。</p>}{recommendation[key].map((bullet, index) => <div className="generated-bullet" key={index}><VoiceTextarea aria-label={`${key === 'resumeBullets' ? '简历要点' : '面试提纲'}${index + 1}`} rows={3} value={displayProjectText(bullet.text, projects)} onChange={(event) => { void changeBullet(recIndex, key, index, { text: event.target.value }); }} /><Evidence item={{ requirementIds: recommendation.requirementIds, factIds: bullet.factIds, sourceIds: [] }} jobs={[job]} projects={projects} sources={sources} /><label className="inline"><input type="checkbox" checked={!!bullet.adopted} disabled={!project?.confirmed || !bullet.factIds.length || !bullet.factIds.every((id) => project.facts.some((fact) => fact.id === id))} onChange={(event) => changeBullet(recIndex, key, index, { adopted: event.target.checked })} />已核对，采用这条表述</label></div>)}</section>)}</article>;
      })}</div>
    </div>
    {saved && <><button className="secondary" onClick={copy}>复制已采用的表述</button>{saved.data.gaps.length > 0 && <div className="notice"><h3>尚缺少事实支撑</h3>{saved.data.gaps.map((item, index) => <div key={index}><p>{displayProjectText(item.text, projects)}：{displayProjectText(item.reason, projects)}</p><Evidence item={item} jobs={[job]} projects={projects} sources={sources} /></div>)}</div>}{saved.data.needsReview.length > 0 && <details><summary>需要确认的内容</summary>{saved.data.needsReview.map((text, index) => <p key={index}>{displayProjectText(text, projects)}</p>)}</details>}</>}
    {history.length > 1 && <label>查看已保存版本<select value={saved?.id || ''} onChange={(event) => setSaved(history.find((item) => item.id === event.target.value) || null)}>{history.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString('zh-CN')}</option>)}</select></label>}
  </section>;
}

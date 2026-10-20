'use client';
import { useEffect, useState } from 'react';
import { database, type Job, type Project, type RecommendationResult, type SavedResult, type Source } from '../lib/database';
import { api, copyText, displayText, inputVersion, modelProjects } from '../lib/client';
import { Evidence } from './evidence';

export default function ProjectBuilder({ job, projects, sources }: { job: Job; projects: Project[]; sources: Source[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedResult<RecommendationResult> | null>(null);
  const [history, setHistory] = useState<SavedResult<RecommendationResult>[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const confirmed = projects.filter((project) => project.confirmed);
  const version = inputVersion(job, confirmed, sources);
  useEffect(() => { database.recommendations.where('jobId').equals(job.id).sortBy('createdAt').then((items) => { setHistory(items.reverse()); setSaved(items[0] || null); setSelected(items[0]?.data.recommendations.map((recommendation) => recommendation.projectId).filter((id) => projects.some((project) => project.id === id)) || []); }); }, [job.id]);

  async function generate() {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await api<RecommendationResult>('/api/project-recommendations', { job, projects: modelProjects(confirmed), sources, preference: selected, maxProjects: 3, outputModes: ['resume_bullets', 'interview_outline'] });
      if (!data.recommendations.length) throw new Error('尚未找到有事实支撑的项目表述，请补充并核对项目事实后重试。');
      const result = { id: crypto.randomUUID(), jobId: job.id, inputVersion: version, data, createdAt: new Date().toISOString() };
      await database.recommendations.put(result); setSaved(result); setHistory((items) => [result, ...items]); setSelected(data.recommendations.map((item) => item.projectId));
    } catch (error) { setError(error instanceof Error ? error.message : '本次未完成，请重试。'); }
    finally { setBusy(false); }
  }

  async function changeBullet(recIndex: number, key: 'resumeBullets' | 'interviewOutline', index: number, change: { text?: string; adopted?: boolean }) {
    if (!saved) return;
    const data = structuredClone(saved.data);
    Object.assign(data.recommendations[recIndex][key][index], change);
    if (change.text !== undefined) data.recommendations[recIndex][key][index].adopted = false;
    const next = { ...saved, data };
    setSaved(next); setHistory((items) => items.map((item) => item.id === next.id ? next : item)); await database.recommendations.put(next);
  }

  async function copy() {
    if (!saved) return;
    const bullets = saved.data.recommendations.flatMap((recommendation) => {
      const project = projects.find((project) => project.id === recommendation.projectId);
      const lines = [...recommendation.resumeBullets, ...recommendation.interviewOutline].filter((item) => item.adopted).map((item) => item.text);
      return lines.length ? [project ? displayText(project.name, project) : '', ...lines] : [];
    });
    if (!bullets.length) { setError('请先核对并采用需要复制的表述。'); return; }
    try { await copyText(bullets.join('\n')); setMessage('已复制采用的表述。'); } catch { setError('复制未完成，可选中所需文字复制。'); }
  }

  async function manual() {
    const data: RecommendationResult = { recommendations: selected.map((id, index) => {
      const project = confirmed.find((project) => project.id === id)!;
      return { projectId: id, rank: index + 1, role: index === 0 ? 'primary' : 'supporting', matchType: 'needs_more', requirementIds: [], factIds: project.facts.map((fact) => fact.id), reason: '按你选择的讲述顺序整理，请结合JD核对与调整。', resumeBullets: project.facts.map((fact) => ({ text: displayText(fact.text, project), factIds: [fact.id] })), interviewOutline: [] };
    }), gaps: [], needsReview: [] };
    const record = { id: crypto.randomUUID(), jobId: job.id, inputVersion: version, createdAt: new Date().toISOString(), data };
    await database.recommendations.put(record); setSaved(record); setHistory((items) => [record, ...items]);
  }

  return <section className="panel builder"><div className="section-heading"><div><h2>按岗位组装项目</h2><p className="muted">选择一个主讲项目、最多两个辅助项目，逐条核对后采用。</p></div><button className="primary" onClick={generate} disabled={busy || !confirmed.length}>{busy ? '正在匹配并改写…' : saved ? '重新推荐与改写' : 'AI推荐项目'}</button></div>
    <p className="privacy-note">仅将已确认项目的事实及所选岗位用于本次推荐；可展示项目先应用脱敏替换。</p><button className="text-button" disabled={!selected.length || busy} onClick={manual}>用所选原始事实手动组装</button>
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}{saved && saved.inputVersion !== version && <div className="notice">岗位或项目资料已更新，以下为旧版，可重新生成。</div>}
    <div className="builder-columns"><div><h3>1. JD要求</h3>{[...(job.requirements || []), ...(job.responsibilities || [])].map((item) => <blockquote key={item.id}><strong>{item.text}</strong><p className="muted">{item.sourceText || item.text}</p></blockquote>)}</div>
      <div><h3>2. 候选项目</h3>{!confirmed.length && <p>先在“我的项目”中核对项目事实，也可先手动添加真实项目。</p>}{confirmed.map((project) => <div key={project.id} className="candidate"><label className="inline"><input type="checkbox" checked={selected.includes(project.id)} disabled={!selected.includes(project.id) && selected.length >= 3} onChange={(event) => setSelected((items) => event.target.checked ? [...items, project.id] : items.filter((id) => id !== project.id))} />{displayText(project.name, project)}</label><p className="muted">{project.stage} · {project.sources.map((source) => source.label).join('、')}</p><details><summary>原始事实</summary>{project.facts.map((fact) => <p key={fact.id}>{displayText(fact.text, project)}</p>)}</details></div>)}{selected.length > 0 && <div><h4>讲述顺序</h4>{selected.map((id, index) => <div key={id}>{index === 0 ? '主讲' : '辅助'}：{projects.find((project) => project.id === id)?.name}<button className="text-button" disabled={index === 0} onClick={() => setSelected((items) => { const next = [...items]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>前移</button></div>)}</div>}</div>
      <div><h3>3. 岗位版表述</h3>{saved?.data.recommendations.map((recommendation, recIndex) => {
        const project = projects.find((project) => project.id === recommendation.projectId);
        return <article className="generated-project" key={recommendation.projectId}><h4>{project ? displayText(project.name, project) : '项目已删除'}</h4><span className="tag">{recommendation.role === 'primary' ? '主讲' : '辅助'} · {{ direct: '直接相关', transferable: '方法可迁移', needs_more: '需要补充' }[recommendation.matchType]}</span><p>{recommendation.reason}</p><Evidence item={{ requirementIds: recommendation.requirementIds, factIds: recommendation.factIds, sourceIds: [] }} jobs={[job]} projects={projects} sources={sources} />{(['resumeBullets', 'interviewOutline'] as const).map((key) => <section key={key}><h4>{key === 'resumeBullets' ? '简历要点' : '面试提纲'}</h4>{recommendation[key].map((bullet, index) => <div className="generated-bullet" key={index}><textarea aria-label={`${key === 'resumeBullets' ? '简历要点' : '面试提纲'}${index + 1}`} rows={3} value={bullet.text} onChange={(event) => { void changeBullet(recIndex, key, index, { text: event.target.value }); }} /><Evidence item={{ requirementIds: recommendation.requirementIds, factIds: bullet.factIds, sourceIds: [] }} jobs={[job]} projects={projects} sources={sources} /><label className="inline"><input type="checkbox" checked={!!bullet.adopted} disabled={!project || !bullet.factIds.length} onChange={(event) => changeBullet(recIndex, key, index, { adopted: event.target.checked })} />已核对，采用这条表述</label></div>)}</section>)}</article>;
      })}{!saved && <p className="muted">推荐后可并排查看事实、岗位要求和可编辑的表述。暂时无法生成时，仍可手动选项目和安排顺序。</p>}</div>
    </div>
    {saved && <><button className="secondary" onClick={copy}>复制已采用的表述</button>{saved.data.gaps.length > 0 && <div className="notice"><h3>尚缺少事实支撑</h3>{saved.data.gaps.map((item, index) => <div key={index}><p>{item.text}：{item.reason}</p><Evidence item={item} jobs={[job]} projects={projects} sources={sources} /></div>)}</div>}{saved.data.needsReview.length > 0 && <details><summary>需要确认的内容</summary>{saved.data.needsReview.map((text, index) => <p key={index}>{text}</p>)}</details>}</>}
    {history.length > 1 && <label>查看已保存版本<select value={saved?.id || ''} onChange={(event) => setSaved(history.find((item) => item.id === event.target.value) || null)}>{history.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString('zh-CN')}</option>)}</select></label>}
  </section>;
}

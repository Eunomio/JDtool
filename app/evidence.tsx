'use client';
import type { Advice, Job, Project, Source } from '../lib/database';
import { displayText, displayProjectText } from '../lib/client';

export function Evidence({ item, jobs, projects, sources }: { item: Pick<Advice, 'requirementIds' | 'factIds' | 'sourceIds'>; jobs: Job[]; projects: Project[]; sources: Source[] }) {
  const requirements = jobs.flatMap((job) => [...(job.requirements || []), ...(job.responsibilities || []), { id: `${job.id}-original`, text: job.content, sourceText: job.content }].map((requirement) => ({ ...requirement, job })));
  return <details className="evidence"><summary>查看依据</summary>
    {item.requirementIds.map((id) => { const reference = requirements.find((requirement) => requirement.id === id); return reference ? <blockquote key={id}><span className="reference-label">{reference.job.company} · {reference.job.sample ? '岗位摘要' : reference.sourceText ? 'JD原句' : '手动补充，待核对'}</span><p>{reference.sourceText || reference.text}</p></blockquote> : null; })}
    {item.factIds.map((id) => { const project = projects.find((project) => project.facts.some((fact) => fact.id === id)); const fact = project?.facts.find((fact) => fact.id === id); return project && fact ? <blockquote key={id}><span className="reference-label">{displayText(project.name, project)} · 原始事实</span><p>{displayText(fact.text, project)}</p><p className="muted">原文：{displayText(fact.sourceText, project)}</p></blockquote> : null; })}
    {item.sourceIds.map((id) => { const source = sources.find((source) => source.id === id); return source ? <blockquote key={id}><span className="reference-label">{source.label}</span>{source.url && <a href={source.url} target="_blank" rel="noreferrer">查看公开来源</a>}<p>{source.text}</p><small>采集于 {new Date(source.collectedAt).toLocaleString('zh-CN')}</small></blockquote> : null; })}
    {!item.requirementIds.length && !item.factIds.length && !item.sourceIds.length && <p className="muted">建议尚待结合原文确认。</p>}
  </details>;
}

export function AdviceList({ title, items, jobs, projects, sources, addTask }: { title: string; items: Advice[]; jobs: Job[]; projects: Project[]; sources: Source[]; addTask?: (text: string) => void }) {
  return <section className="advice-section"><h3>{title}</h3>{!items.length && <p className="muted">可补充资料后继续生成。</p>}{items.map((item, index) => <div className="advice-item" key={index}><strong>{displayProjectText(item.text, projects)}</strong><p>{displayProjectText(item.reason, projects)}</p><Evidence item={item} jobs={jobs} projects={projects} sources={sources} />{addTask && <button className="text-button" onClick={() => addTask(item.text)}>加入我的计划</button>}</div>)}</section>;
}

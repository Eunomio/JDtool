'use client';
import { useId } from 'react';
import type { Job, Project, Recommendation, Source } from '../lib/database';
import { displayText, displayProjectText } from '../lib/client';
import VoiceTextarea from './voice-textarea';
import { Evidence } from './evidence';
import { Icon } from './ui';
import { ProjectMatchBadge } from './project-match';

export default function ProjectExpression({ job, recommendation, projects, sources, stale, expanded, onToggle, onChange }: { job: Job; recommendation: Recommendation; projects: Project[]; sources: Source[]; stale: boolean; expanded: boolean; onToggle: () => void; onChange: (key: 'resumeBullets' | 'interviewOutline', index: number, change: { text?: string; adopted?: boolean }) => void }) {
  const id = useId(); const project = projects.find(item => item.id === recommendation.projectId);
  const name = project ? displayText(project.name, project) : '项目已删除';
  return <article className="generated-project project-expression" data-expanded={expanded}>
    <h4><button type="button" className="project-expression-toggle" aria-expanded={expanded} aria-controls={id} aria-label={`${expanded ? '收起' : '展开'}${name}的岗位版表述`} onClick={onToggle}><span><strong>{name}</strong><span className="project-expression-meta"><span className="tag">{recommendation.role === 'primary' ? '主讲' : '辅助'}</span><ProjectMatchBadge job={job} projects={projects} recommendation={recommendation} stale={stale} /></span></span><Icon name="chevron" size={18} /></button></h4>
    <div id={id} className="project-expression-content" hidden={!expanded}>
      <p className="project-expression-reason">{displayProjectText(recommendation.reason, projects)}</p>
      {(['resumeBullets', 'interviewOutline'] as const).map(key => <section key={key}><h5>{key === 'resumeBullets' ? '简历要点' : '面试提纲'}</h5>
        {!recommendation[key].length && <p className="builder-empty">这份记录尚未保存{key === 'resumeBullets' ? '简历要点' : '面试提纲'}，可点击“重新推荐与改写”补全。</p>}
        {recommendation[key].map((bullet, index) => <div className="generated-bullet" key={index}><VoiceTextarea aria-label={`${key === 'resumeBullets' ? '简历要点' : '面试提纲'}${index + 1}`} rows={3} value={displayProjectText(bullet.text, projects)} onChange={event => onChange(key, index, { text: event.target.value })} actions={<>
          <Evidence compact item={{ requirementIds: recommendation.requirementIds, factIds: bullet.factIds, sourceIds: [] }} jobs={[job]} projects={projects} sources={sources} />
          <label className="inline"><input type="checkbox" aria-label="已核对，采用这条表述" checked={!!bullet.adopted} disabled={!project?.confirmed || !bullet.factIds.length || !bullet.factIds.every(factId => project.facts.some(fact => fact.id === factId))} onChange={event => onChange(key, index, { adopted: event.target.checked })} />已核对</label>
        </>} /></div>)}
      </section>)}
    </div>
  </article>;
}

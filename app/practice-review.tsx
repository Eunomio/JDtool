'use client';
import { useState } from 'react';
import type { Job, PracticeFeedback } from '../lib/database';
import { PlanButton, Tabs } from './ui';

export default function PracticeReview({ feedback, job, mode, onCopy, onAdd, onNext }: { feedback: PracticeFeedback; job: Job; mode: 'interview' | 'scenario'; onCopy: () => void; onAdd: (text: string) => void; onNext: (text: string) => void }) {
  const [section, setSection] = useState('overview');
  return <div className="page-stack practice-review"><h2>本次复盘</h2><Tabs label="练习复盘内容" className="content-tabs" value={section} onChange={setSection} items={[{ id: 'overview', label: '表现总结' }, { id: 'dimensions', label: '能力反馈' }, { id: 'outline', label: mode === 'interview' ? '回答提纲' : '改进思路' }, { id: 'actions', label: '下一步练习' }]} />
    <div role="tabpanel" id="练习复盘内容-panel-overview" aria-labelledby="练习复盘内容-overview" hidden={section !== 'overview'}><section><h3>做得好的点</h3><ul>{feedback.strengths.map((text, index) => <li key={index}>{text}</li>)}</ul></section><section><h3>值得补充的点</h3><ul>{feedback.improvements.map((text, index) => <li key={index}>{text}</li>)}</ul></section></div>
    <div role="tabpanel" id="练习复盘内容-panel-dimensions" aria-labelledby="练习复盘内容-dimensions" hidden={section !== 'dimensions'}>{feedback.dimensions.map((dimension, index) => <div className="advice-item" key={index}><h3>{dimension.name}</h3><p>{dimension.feedback}</p><details><summary>对应JD要求</summary>{[...(job.requirements || []), ...(job.responsibilities || []), { id: `${job.id}-original`, text: job.content, sourceText: job.content }].filter(item => dimension.requirementIds.includes(item.id)).map(item => <blockquote key={item.id}>{item.sourceText || item.text}</blockquote>)}</details></div>)}</div>
    <div role="tabpanel" id="练习复盘内容-panel-outline" aria-labelledby="练习复盘内容-outline" hidden={section !== 'outline'}><h3>{mode === 'interview' ? '完善回答的提纲' : '下一次任务可尝试的做法'}</h3><ol>{feedback.outline.map((text, index) => <li key={index}>{text}</li>)}</ol><button className="secondary" onClick={onCopy}>复制提纲</button></div>
    <div role="tabpanel" id="练习复盘内容-panel-actions" aria-labelledby="练习复盘内容-actions" hidden={section !== 'actions'}><h3>建议练习</h3>{feedback.nextActions.map((text, index) => <article className="advice-item" key={index}><p>{text}</p><div className="actions"><PlanButton key={text} onAdd={() => onAdd(text)} /><button className="secondary" onClick={() => onNext(text)}>设为下一步行动</button></div></article>)}</div>
  </div>;
}

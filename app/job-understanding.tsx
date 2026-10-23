'use client';

import type { CompanyResult, Job, Project, Source } from '../lib/database';
import { AdviceList } from './evidence';
import { Icon, Tabs } from './ui';

export const understandingSections = [
  { id: 'requirements', label: '岗位要求' },
  { id: 'business', label: '公司与业务' },
  { id: 'role', label: '岗位与业务' },
  { id: 'questions', label: '面试问题' },
  { id: 'uncertain', label: '待确认信息' },
] as const;
export type UnderstandingTab = typeof understandingSections[number]['id'];
const label = '岗位与公司内容';
const panelProps = (id: UnderstandingTab) => ({ role: 'tabpanel', id: `${label}-panel-${id}`, 'aria-labelledby': `${label}-${id}` });

export function UnderstandingTabs({ value, onChange }: { value: UnderstandingTab; onChange: (value: UnderstandingTab) => void }) {
  return <Tabs label={label} className="understanding-tabs" items={understandingSections} value={value} onChange={onChange} />;
}

export function JobRequirements({ job, hidden = false }: { job: Job; hidden?: boolean }) {
  const duties = job.responsibilities || []; const requirements = job.requirements || [];
  const dutyList = (items: typeof duties, offset = 0) => <ol className="requirement-list">{items.map((item, index) => <li key={item.id}><span>{String(index + offset + 1).padStart(2, '0')}</span><p>{item.text}</p></li>)}</ol>;
  const skillList = (items: typeof requirements) => <div className="skill-list">{items.map(item => <p key={item.id}><Icon name="check" size={16} />{item.text}</p>)}</div>;
  return <section {...panelProps('requirements')} hidden={hidden} className="panel job-requirements" data-tour="jd-breakdown">
    <div className="role-overview"><section><h2>这个岗位要解决什么</h2>{duties.length ? dutyList(duties.slice(0, 4)) : <p className="muted">查看JD原文，补充岗位职责后可更具体地准备。</p>}{duties.length > 4 && <details><summary>展开其余{duties.length - 4}条职责</summary>{dutyList(duties.slice(4), 4)}</details>}</section>
      <section><h2>准备时优先关注</h2>{skillList(requirements.slice(0, 4))}{requirements.length > 4 && <details><summary>展开其余{requirements.length - 4}条要求</summary>{skillList(requirements.slice(4))}</details>}{!requirements.length && <p className="muted">任职要求可在完整JD中查看或补充。</p>}</section></div>
    <details className="original-jd"><summary>查看完整JD与原始资料</summary>{job.sourceUrl && <a href={job.sourceUrl} target="_blank" rel="noreferrer">查看招聘页面 ↗</a>}<pre className="source-text">{job.content}</pre>{job.images?.map((image, index) => <img className="source-image" key={index} src={image.dataUrl} alt={`岗位原始截图${index + 1}`} />)}</details>
  </section>;
}

export function CompanyInsights({ section, data, createdAt, job, projects, sources, addTask }: { section: UnderstandingTab; data: CompanyResult; createdAt?: string; job: Job; projects: Project[]; sources: Source[]; addTask: (text: string) => void }) {
  const evidence = { jobs: [job], projects, sources };
  return <>
    <div {...panelProps('business')} hidden={section !== 'business'}>
      {data.research && <div className="research-summary"><span className="tag">基于公开来源</span>{createdAt && <span className="muted">{new Date(createdAt).toLocaleDateString('zh-CN')}</span>}<p>{data.research.summary}</p>{data.research.identityNote && <details><summary>公司主体核对</summary><p>{data.research.identityNote}</p></details>}</div>}
      <AdviceList items={data.businesses?.length ? data.businesses : data.facts} {...evidence} />
    </div>
    <div {...panelProps('role')} hidden={section !== 'role'}><AdviceList items={data.roleInsights || []} {...evidence} addTask={addTask} emptyText="还没有岗位关联建议，可更新公司研究或分析已保存资料。" /></div>
    <div {...panelProps('questions')} hidden={section !== 'questions'}><AdviceList items={data.questions} {...evidence} addTask={addTask} emptyText="目前没有需要补充的面试问题。" /></div>
    <div {...panelProps('uncertain')} hidden={section !== 'uncertain'}><AdviceList items={data.hypotheses} {...evidence} emptyText="目前没有额外列出的待确认信息。" /></div>
  </>;
}

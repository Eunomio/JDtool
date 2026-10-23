'use client';
import { useState } from 'react';
import type { Job, PreparationResult, Project, Source } from '../lib/database';
import { AdviceList } from './evidence';
import { Tabs } from './ui';

const sections = [{ id: 'priorities', label: '岗位看重什么' }, { id: 'strengths', label: '我能讲什么' }, { id: 'gaps', label: '还需补什么' }, { id: 'companyResearch', label: '面试前了解什么' }] as const;
export default function PreparationContent({ data, job, projects, sources, addTask }: { data: PreparationResult; job: Job; projects: Project[]; sources: Source[]; addTask: (text: string) => void }) {
  const [section, setSection] = useState<keyof PreparationResult>('priorities');
  return <div className="page-stack preparation-content"><Tabs label="准备卡内容" className="content-tabs" value={section} items={sections} onChange={setSection} />{sections.map(item => <div key={item.id} hidden={section !== item.id} role="tabpanel" id={`准备卡内容-panel-${item.id}`} aria-labelledby={`准备卡内容-${item.id}`}><AdviceList title={item.label} items={data[item.id]} jobs={[job]} projects={projects} sources={sources} addTask={addTask} /></div>)}</div>;
}

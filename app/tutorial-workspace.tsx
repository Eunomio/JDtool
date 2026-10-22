'use client';

import { useState } from 'react';
import { tutorialCase } from '../lib/tutorial-case';
import type { Advice, Task } from '../lib/database';
import type { TutorialStep } from './onboarding';
import { AdviceList, Evidence } from './evidence';
import ColleagueMessage from './colleague-message';
import { Icon } from './ui';

export default function TutorialWorkspace({ step, onNext, onOwnJob, onRestart }: { step: TutorialStep; onNext: () => void; onOwnJob: () => void; onRestart: () => void }) {
  const { job, project, sources, company, recommendations, preparation } = tutorialCase;
  const [mode, setMode] = useState<'link' | 'images' | 'text'>('link');
  const [tasks, setTasks] = useState<Task[]>(() => structuredClone(tutorialCase.tasks));
  const [adopted, setAdopted] = useState(false);
  const [review, setReview] = useState(false);
  const evidence = { jobs: [job], projects: [project], sources };
  const addTask = (text: string) => setTasks(current => current.some(task => task.text === text) ? current : [...current, { id: `tutorial-task-${current.length + 1}`, text, jobIds: [job.id], done: false, order: current.length, createdAt: job.createdAt }]);
  const adviceList = (title: string, items: Advice[], canPlan = false) => <AdviceList title={title} items={items} {...evidence} addTask={canPlan ? addTask : undefined} />;
  const identity = <header className="tutorial-job-identity"><span className="company-avatar large">星</span><div><span className="tag">教程示例</span><h1>{job.title}</h1><p>{job.company} · 用户体验设计 · {job.location} · {job.hiringType}</p></div></header>;

  let content;
  if (step === 'add') content = <>
    <div className="dashboard-heading"><div><h1>把机会，变成下一步。</h1></div><button className="secondary tutorial-launch" onClick={onRestart}><Icon name="sparkles" size={17} />新手教程</button></div>
    <section className="dashboard-hero tutorial-hero"><div className="hero-content"><h2>添加岗位，<br />准备简历与面试</h2><p>通过一个示例，了解岗位解析、项目匹配和准备计划。</p><button className="hero-button" onClick={onNext}>开始教程 <Icon name="arrow" size={18} /></button></div><div className="tutorial-hero-icon" aria-hidden="true"><Icon name="target" size={72} /></div></section>
  </>;
  else if (step === 'input') content = <section className="panel import-panel import-start" data-tour="jd-input"><h1>提供岗位</h1>
    <div className="tabs" role="tablist" aria-label="案例输入方式">{([['link', '岗位链接'], ['images', 'JD截图'], ['text', '粘贴正文']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={mode === id} onClick={() => setMode(id)}>{label}</button>)}</div>
    {mode === 'link' && <label>招聘页面链接<input readOnly value="https://careers.example.com/experience-design" /><p className="muted">示例链接已填好，可直接查看解析结果</p></label>}
    {mode === 'images' && <div className="tutorial-screenshot"><Icon name="image" size={24} /><h2>JD截图示例</h2><strong>{job.company} · {job.title}</strong><p className="source-text">{job.content}</p></div>}
    {mode === 'text' && <label>岗位正文<textarea rows={9} readOnly value={job.content} /></label>}
    <button className="primary" onClick={onNext}>查看解析结果 <Icon name="arrow" size={16} /></button>
  </section>;
  else if (step === 'review') content = <section className="panel" data-tour="jd-review"><h1>核对岗位信息</h1><div className="review-layout">
    <div className="source-preview"><h2>原始JD</h2><pre className="source-text">{job.content}</pre></div><div className="review-fields"><label>岗位名称<input readOnly value={job.title} /></label><label>公司名称<input readOnly value={job.company} /></label><div className="field-pair"><label>地点<input readOnly value={job.location} /></label><label>招聘类型<input readOnly value={job.hiringType} /></label></div><span className="category-badge">用户体验设计</span><label>岗位职责<textarea rows={5} readOnly value={job.responsibilities!.map(item => item.text).join('\n')} /></label><label>任职要求<textarea rows={4} readOnly value={job.requirements!.map(item => item.text).join('\n')} /></label><button className="primary" onClick={onNext}>查看岗位拆解</button></div>
  </div></section>;
  else if (step === 'requirements') content = <>{identity}<div className="role-overview" data-tour="jd-breakdown"><section className="panel"><h2>这个岗位要解决什么</h2><ol className="requirement-list">{job.responsibilities!.map((item, index) => <li key={item.id}><span>0{index + 1}</span><p>{item.text}</p></li>)}</ol></section><section className="panel"><h2>准备时优先关注</h2><div className="skill-list">{job.requirements!.map(item => <p key={item.id}><Icon name="check" size={15} />{item.text}</p>)}</div><details><summary>查看完整JD</summary><pre className="source-text">{job.content}</pre></details></section></div></>;
  else if (step === 'category') content = <>{identity}<section className="panel" data-tour="job-category"><div className="section-heading"><h2>用户体验设计</h2><span className="category-badge">自动归类</span></div><p>{job.classification!.reason}</p><details open><summary>查看分类的JD依据</summary>{job.classification!.evidence.map(text => <blockquote key={text}>{text}</blockquote>)}</details></section></>;
  else if (step === 'company') content = <>{identity}<section className="panel company-research" data-tour="company-research"><h2>公司业务与岗位</h2><div className="insight-grid">{adviceList('主要业务', company.businesses!)}{adviceList('岗位相关工作', company.roleInsights!)}</div>{adviceList('待确认信息', company.hypotheses)}{adviceList('面试时可确认的问题', company.questions)}</section></>;
  else if (step === 'projects') content = <section className="panel" data-tour="project-import"><h1>整理项目经历</h1><p>可从简历或作品集整理项目，也支持手动新增。以下是一个已核对的课程项目。</p><article className="tutorial-project-facts"><span className="tag">课程项目 · 已测试</span><h2>{project.name}</h2><p><strong>本人角色：</strong>{project.role}</p><p><strong>问题：</strong>{project.problem}</p><p><strong>做法：</strong>{project.actions}</p><p><strong>结果：</strong>{project.results}</p><h3>已核对的内容</h3>{project.facts.map(fact => <blockquote key={fact.id}>{fact.text}</blockquote>)}<span className="category-badge"><Icon name="check" size={14} />已核对</span></article><button className="primary" onClick={onNext}>查看岗位匹配</button></section>;
  else if (step === 'match') content = <>{identity}<section className="panel builder" data-tour="project-builder"><h2>匹配岗位与项目</h2><div className="builder-columns"><div><h3>1. JD要求</h3>{job.requirements!.map(item => <blockquote key={item.id}>{item.text}</blockquote>)}</div><div><h3>2. 主讲项目</h3><h4>{project.name}</h4><span className="tag">研究与设计方法相近</span><p>{recommendations.recommendations[0].reason}</p><Evidence item={{ ...recommendations.recommendations[0], sourceIds: [] }} {...evidence} /></div><div><h3>3. 岗位版表述</h3><h4>简历要点</h4><p>{recommendations.recommendations[0].resumeBullets[0].text}</p><h4>面试提纲</h4><p>{recommendations.recommendations[0].interviewOutline[0].text}</p><label className="inline"><input type="checkbox" checked={adopted} onChange={event => setAdopted(event.target.checked)} />已核对，采用这条表述</label>{adopted && <p role="status" className="tutorial-example-note">已采用，仅本次教程有效。</p>}</div></div></section></>;
  else if (step === 'preparation') content = <>{identity}<section className="panel" data-tour="preparation-card"><h2>岗位准备卡</h2><div className="preparation-grid">{adviceList('岗位看重什么', preparation.priorities, true)}{adviceList('我能讲什么', preparation.strengths, true)}{adviceList('还需补什么', preparation.gaps, true)}{adviceList('面试前了解什么', preparation.companyResearch, true)}</div></section></>;
  else if (step === 'practice') content = <>{identity}<div className="practice-launch-grid" data-tour="practice-launch"><section className="panel"><Icon name="interview" size={28} /><h2>模拟面试</h2><h3>面试题示例</h3><p>请介绍一个项目：你发现了什么问题、为什么选这个方案、如何验证效果？</p><p className="muted">回答后会收到追问，补充回答后可查看复盘。</p></section><section className="panel"><Icon name="scenario" size={28} /><h2>体验岗位一天</h2><ColleagueMessage colleague="产品经理" text="新成员经常找不到创建任务的入口。你能先列一下需要确认的问题，再给个测试方案吗？" /><p className="muted">先向同事了解情况，再提交你的处理方案。</p></section><button className="secondary" onClick={() => setReview(current => !current)}>查看复盘示例</button>{review && <section className="panel tutorial-practice-review"><h3>复盘示例</h3>{adviceList('建议练习', [tutorialCase.preparation.gaps[0]], true)}</section>}</div></>;
  else content = <><h1>准备计划</h1><section className="panel tutorial-plan" data-tour="weekly-plan"><div className="section-heading"><h2>本周准备</h2><span className="count">{tasks.filter(task => task.done).length} / {tasks.length}</span></div><progress value={tasks.filter(task => task.done).length} max={tasks.length} />{tasks.map(task => <label className="tutorial-plan-item" key={task.id}><input type="checkbox" checked={task.done} onChange={event => setTasks(current => current.map(item => item.id === task.id ? { ...item, done: event.target.checked } : item))} /><span className={task.done ? 'completed' : ''}>{task.text}<small>{job.company} · {job.title}</small></span></label>)}</section><section className="panel"><h2>开始准备你的岗位</h2><p>添加感兴趣的岗位，开始准备。需要时可在首页重新查看教程。</p></section></>;

  return <div className="page-stack tutorial-workspace" data-testid="tutorial-workspace"><aside className="tutorial-case-banner"><span className="tag">教程示例</span><span>以下为虚构示例，不会保存到你的账号。</span><button className="secondary small" onClick={onOwnJob}>使用自己的JD</button></aside>{content}</div>;
}

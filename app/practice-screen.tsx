'use client';
import { useRef, type ReactNode } from 'react';
import { Icon } from './ui';

export default function PracticeScreen({ mode, company, title, phase, children }: { mode: 'interview' | 'scenario'; company: string; title: string; phase: string; children: ReactNode }) {
  const screen = useRef<HTMLDivElement>(null);
  function focus(selector: string) {
    const target = screen.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    if (target instanceof HTMLDetailsElement) target.open = true;
    target.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <div ref={screen} className={`practice-device ${mode}-device`}><header className="device-bar"><div className="device-window-dots" aria-hidden="true"><i /><i /><i /></div><strong><Icon name={mode === 'scenario' ? 'jobs' : 'interview'} size={17} />{mode === 'scenario' ? '工作台' : '面试室'}</strong><span className="device-phase"><i />{phase}</span></header>
    <div className="device-context"><span className="device-company">{(company || '目标公司').slice(0, 1)}</span><div><strong>{company || '目标公司'}</strong><span>{title}</span></div></div>
    {mode === 'scenario' ? <nav className="screen-toolbar" aria-label="工作台窗口"><button onClick={() => focus('.task-brief')}><Icon name="jobs" size={18} />任务简报</button><button onClick={() => focus('.colleague-message')}><Icon name="interview" size={18} />同事消息</button><button onClick={() => focus('.practice-sources')}><Icon name="projects" size={18} />工作资料</button><button onClick={() => focus('.end-actions, .practice-review')}><Icon name="arrow" size={18} />我的行动</button></nav>
      : <div className="interview-participants" aria-label="面试参与者"><div><span className="participant-avatar"><Icon name="interview" size={24} /></span><strong>面试官</strong><span className="participant-status"><i />{phase.startsWith('正在') ? '准备中' : '已就绪'}</span></div><div><span className="participant-avatar participant-self"><Icon name="projects" size={24} /></span><strong>我</strong><span className="participant-status">{phase}</span></div></div>}
    <div className="device-content">{children}</div><div className="device-bottom" aria-hidden="true"><span /></div>
  </div>;
}

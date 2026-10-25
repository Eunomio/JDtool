'use client';
import { useContext, useEffect, useState } from 'react';
import { PracticeCompactContext } from './practice-screen';
import { Icon } from './ui';

export default function PracticeBrief({ mode, background, task, index, count }: { mode: 'interview' | 'scenario'; background: string; task?: { title: string; change: string }; index: number; count: number }) {
  const compact = useContext(PracticeCompactContext);
  const [open, setOpen] = useState(mode === 'interview' && !compact);
  useEffect(() => { setOpen(mode === 'interview' && !compact); }, [compact, mode]);
  return <div className="conversation-context"><details className="task-brief" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary><div><h2>{mode === 'interview' ? '问题背景' : '任务简报'}</h2>{mode === 'scenario' && task && <strong className="brief-task-title">{task.title}<span>任务 {String(index + 1).padStart(2,'0')} / {String(count).padStart(2,'0')}</span></strong>}</div><Icon name="chevron" size={15} /></summary><div className="brief-content"><p>{background}</p>{mode === 'scenario' && task?.change && <p className="task-deliverable">{task.change}</p>}</div></details></div>;
}

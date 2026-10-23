'use client';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui';

export default function PracticeScreen({ mode, company, title, phase, sidebar, tools, children }: { mode: 'interview' | 'scenario'; company: string; title: string; phase: string; sidebar?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  const screen = useRef<HTMLDivElement>(null); const [height, setHeight] = useState(640);
  useLayoutEffect(() => {
    function measure() {
      if (!screen.current) return;
      const viewport = window.visualViewport; let bottom = (viewport?.height || innerHeight) + (viewport?.offsetTop || 0);
      const main = document.getElementById('workspace-main');
      if (document.documentElement.dataset.tutorialActive && main) bottom = Math.min(bottom, main.getBoundingClientRect().bottom);
      const nav = document.querySelector<HTMLElement>('.mobile-navigation');
      if (nav && getComputedStyle(nav).display !== 'none') bottom = Math.min(bottom, nav.getBoundingClientRect().top);
      const next = Math.max(240, Math.min(860, bottom - Math.max(0, screen.current.getBoundingClientRect().top) - 12));
      setHeight(current => Math.abs(current - next) > 2 ? next : current);
    }
    measure(); const observer = new ResizeObserver(measure); const main = document.getElementById('workspace-main'); if (main) observer.observe(main);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    const focus = () => requestAnimationFrame(measure); document.addEventListener('focusin', focus); document.addEventListener('focusout', focus);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus); };
  }, []);
  return <div ref={screen} className={`practice-device conversation-app ${mode}-device`} style={{ height }} data-compact={height < 570} data-short={height < 400}>
    <header className="conversation-app-header"><span className="conversation-app-icon"><Icon name={mode === 'interview' ? 'interview' : 'scenario'} size={21} /></span><div><h1>{mode === 'interview' ? '模拟面试' : '岗位体验'}</h1><span>{company} · {title}</span></div><span className="conversation-phase">{phase}</span>{tools}</header>
    <div className={`conversation-layout ${sidebar ? 'with-contacts' : ''}`}>{sidebar}<div className="conversation-main">{children}</div></div>
  </div>;
}

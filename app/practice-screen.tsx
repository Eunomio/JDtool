'use client';
import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui';
export const PracticeCompactContext = createContext(false);

export default function PracticeScreen({ mode, company, title, phase, sidebar, tools, children }: { mode: 'interview' | 'scenario'; company: string; title: string; phase: string; sidebar?: ReactNode; tools?: ReactNode; children: ReactNode }) {
  const screen = useRef<HTMLDivElement>(null); const [height, setHeight] = useState(640);
  const [width, setWidth] = useState(1200);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    function measure() {
      if (!screen.current) return;
      const viewport = window.visualViewport; let bottom = (viewport?.height || innerHeight) + (viewport?.offsetTop || 0);
      const main = document.getElementById('workspace-main');
      if (!expanded && document.documentElement.dataset.tutorialActive && main) bottom = Math.min(bottom, main.getBoundingClientRect().bottom);
      const nav = document.querySelector<HTMLElement>('.mobile-navigation');
      if (!expanded && nav && getComputedStyle(nav).display !== 'none') bottom = Math.min(bottom, nav.getBoundingClientRect().top);
      const keyboard = !!viewport && viewport.height < innerHeight * .75;
      const minimum = expanded || document.documentElement.dataset.tutorialActive ? 240 : keyboard ? 320 : 480;
      const next = Math.max(minimum, Math.min(expanded ? 3000 : 960, bottom - Math.max(0, screen.current.getBoundingClientRect().top) - 12));
      setWidth(screen.current.clientWidth);
      setHeight(current => Math.abs(current - next) > 2 ? next : current);
    }
    measure(); const observer = new ResizeObserver(measure); const main = document.getElementById('workspace-main'); if (main) observer.observe(main);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    const focus = () => requestAnimationFrame(measure); document.addEventListener('focusin', focus); document.addEventListener('focusout', focus);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus); };
  }, [expanded]);
  useLayoutEffect(() => {
    if (!expanded) return;
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) setExpanded(false); };
    window.addEventListener('keydown', escape); return () => { document.body.style.overflow = before; window.removeEventListener('keydown', escape); };
  }, [expanded]);
  return <PracticeCompactContext.Provider value={height < 640 || width < 900}><div ref={screen} className={`practice-device conversation-app ${mode}-device ${expanded ? 'is-expanded' : ''}`} style={{ height }} data-compact={height < 640} data-condensed={height < 560} data-short={height < 420} data-narrow={width < 1000}>
    <header className="conversation-app-header"><span className="conversation-app-icon"><Icon name={mode === 'interview' ? 'interview' : 'scenario'} size={21} /></span><div className="conversation-app-title"><h1>{mode === 'interview' ? '模拟面试' : '岗位体验'}</h1><span>{company} · {title}</span></div><span className="conversation-phase">{phase}</span>{tools}<button className="conversation-expand" aria-label={expanded ? '还原练习窗口' : '放大练习窗口'} title={expanded ? '还原练习窗口' : '放大练习窗口'} onClick={() => setExpanded(value => !value)}><Icon name={expanded ? 'collapse' : 'expand'} size={18} /></button><span id="practice-assistant-entry" /></header>
    <div className={`conversation-layout ${sidebar ? 'with-contacts' : ''}`}>{sidebar}<div className="conversation-main">{children}</div></div>
  </div></PracticeCompactContext.Provider>;
}

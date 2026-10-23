'use client';
import type { KeyboardEvent, ReactNode } from 'react';
import { useState } from 'react';

export function PlanButton({ onAdd }: { onAdd: () => void | Promise<void> }) {
  const [state, setState] = useState<'idle' | 'saving' | 'added'>('idle');
  const [error, setError] = useState('');
  return <span className="plan-action"><button className={`plan-button ${state === 'added' ? 'is-added' : ''}`} disabled={state !== 'idle'} onClick={async () => { setState('saving'); setError(''); try { await onAdd(); setState('added'); } catch { setState('idle'); setError('未能加入，请重试。'); } }}><Icon name={state === 'added' ? 'check' : 'plus'} size={16} />{state === 'saving' ? '正在加入…' : state === 'added' ? '已加入计划' : '加入我的计划'}</button>{error && <small role="alert">{error}</small>}</span>;
}

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    mic: <><rect x="8" y="2" width="8" height="13" rx="4" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    home: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path d="M9 21v-8h6v8" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    detail: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    jobs: <><rect x="4" y="6" width="16" height="15" rx="3" /><path d="M9 6V3h6v3M8 11h8M8 15h5" /></>,
    projects: <><path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M8 13h8M8 17h5" /></>,
    compare: <><rect x="3" y="4" width="7" height="16" rx="2" /><rect x="14" y="4" width="7" height="16" rx="2" /><path d="M6 8h1m10 0h1M6 12h1m10 0h1" /></>,
    interview: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h6a8 8 0 0 1 8 8Z" /><path d="M8 8h8M8 12h5" /></>,
    scenario: <><rect x="3" y="6" width="18" height="15" rx="3" /><path d="M9 6V3h6v3M3 12h18M10 12v3h4v-3" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    plus: <path d="M12 4v16M4 12h16" />,
    check: <path d="m5 12 4 4L19 6" />,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></>,
    link: <><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" /><path d="m3 17 5-5 4 4 4-6 5 7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
    layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></>,
    sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4" /></>,
    merge: <><path d="M5 3v4c0 4 14 5 14 10v4M19 3v4c0 4-14 5-14 10v4m0-4-3 3m17-3 3 3" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    flag: <><path d="M5 22V3m0 1c5-5 9 5 15 0v11c-6 5-10-5-15 0" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.jobs}</svg>;
}

export function Tabs<T extends string>({ label, value, items, onChange, className = '' }: { label: string; value: T; items: readonly { id: T; label: string; icon?: string }[]; onChange: (value: T) => void; className?: string }) {
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === value);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    onChange(items[next].id);
    (event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next])?.focus();
  }
  return <div className={`workspace-tabs ${className}`} role="tablist" aria-label={label} onKeyDown={keyDown}>{items.map((item, index) => <button key={item.id} role="tab" id={`${label}-${item.id}`} aria-controls={`${label}-panel-${item.id}`} aria-selected={item.id === value} tabIndex={item.id === value ? 0 : -1} onClick={() => onChange(item.id)}>{item.icon && <Icon name={item.icon} size={17} />}<span>{item.label}</span><small>{String(index + 1).padStart(2, '0')}</small></button>)}</div>;
}

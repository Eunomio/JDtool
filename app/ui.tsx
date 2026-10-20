import type { KeyboardEvent, ReactNode } from 'react';

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
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

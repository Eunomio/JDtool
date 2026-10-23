'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Job } from '../lib/database';
import { Icon } from './ui';

export default function HomeJobFilter({ jobs, value, onChange }: { jobs: Job[]; value: string; onChange: (id: string) => void }) {
  const id = useId(); const root = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false); const [above, setAbove] = useState(false); const [height, setHeight] = useState(320); const focusIndex = useRef(0);
  const choices = [{ id: '', title: '全部岗位', company: '' }, ...jobs]; const selected = choices.find(job => job.id === value) || choices[0];
  useEffect(() => {
    if (!open) return;
    root.current?.querySelectorAll<HTMLButtonElement>('[role=option]')[focusIndex.current]?.focus();
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function show(index = Math.max(0, choices.findIndex(job => job.id === value))) {
    const rect = trigger.current!.getBoundingClientRect(); const below = innerHeight - rect.bottom - 16; const before = rect.top - 16;
    const upwards = below < 220 && before > below; setAbove(upwards); setHeight(Math.max(100, Math.min(340, upwards ? before : below)));
    focusIndex.current = index; setOpen(true);
  }
  function choose(next: string) { onChange(next); setOpen(false); trigger.current?.focus(); }
  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : open ? (focusIndex.current + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length : Math.max(0, choices.findIndex(job => job.id === value));
    focusIndex.current = next; if (!open) show(next); else root.current?.querySelectorAll<HTMLButtonElement>('[role=option]')[next]?.focus();
  }
  return <div className="hub-job-filter" ref={root} onKeyDown={keyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}><span id={`${id}-label`}>关联岗位</span>
    <button ref={trigger} type="button" className="hub-job-trigger" role="combobox" aria-labelledby={`${id}-label`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-options`} onClick={() => open ? setOpen(false) : show()}><span>{selected.company && <small>{selected.company}</small>}<strong>{selected.title}</strong></span><Icon name="chevron" size={17} /></button>
    {open && <div className="hub-job-options" id={`${id}-options`} role="listbox" aria-labelledby={`${id}-label`} data-above={above} style={{ maxHeight: height }}>{choices.map((job, index) => <button type="button" key={job.id} role="option" aria-selected={value === job.id} aria-label={job.company ? `${job.company} · ${job.title}` : job.title} tabIndex={-1} onFocus={() => { focusIndex.current = index; }} onClick={() => choose(job.id)}><span>{job.company && <small>{job.company}</small>}<strong>{job.title}</strong></span>{value === job.id && <Icon name="check" size={17} />}</button>)}</div>}
  </div>;
}

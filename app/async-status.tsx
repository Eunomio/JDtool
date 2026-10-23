'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { activityStore } from '../lib/request-activity';

export function AsyncStatus({ label, startedAt, onCancel, extra = 0 }: { label: string; startedAt?: number; onCancel?: () => void; extra?: number }) {
  const [start] = useState(() => startedAt || Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const tick = () => setSeconds(Math.floor((Date.now() - start) / 1000)); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [start]);
  return <div className="async-status" role="status" aria-label={label}>
    <span className="async-spinner" aria-hidden="true" /><div className="async-status-copy"><strong>{label}</strong><span className="async-elapsed" aria-hidden="true">{seconds ? `已等待 ${seconds} 秒` : '正在处理'}{extra ? ` · 另有${extra}项` : ''}</span>{seconds >= 20 && <p>还在处理中，请稍候。输入内容会保留。</p>}</div>{onCancel && <button className="secondary small" onClick={onCancel}>停止</button>}
    <span className="async-sweep" aria-hidden="true" />
  </div>;
}
export default function RequestIndicator() {
  const items = useSyncExternalStore(activityStore.subscribe, activityStore.snapshot, activityStore.serverSnapshot);
  const current = items.at(-1);
  return current ? <aside className="request-indicator" aria-label="处理进度"><AsyncStatus key={current.id} label={current.label} startedAt={current.startedAt} onCancel={current.cancel} extra={items.length - 1} /></aside> : null;
}

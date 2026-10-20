'use client';
import { useEffect, useRef, useState } from 'react';
import { database, type Job } from '../lib/database';
import { classifyAndSaveJobs, needsRoleClassification } from '../lib/role-storage';
import { roleInputVersion } from '../lib/role-taxonomy';

export type RoleAnalysis = ReturnType<typeof useRoleClassification>;
const attemptKey = (job: Job) => JSON.stringify([job.id, roleInputVersion(job)]);

export function useRoleClassification(jobs: Job[], ready: boolean, refresh: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const controller = useRef<AbortController | null>(null);
  const attempted = useRef(new Set<string>());
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => () => controller.current?.abort(), []);

  async function analyze(items: Job[], force = true) {
    if (controller.current) return;
    const eligible = items.filter(job => job.content.trim().length >= 15);
    if (!eligible.length) { setError('请先添加包含职责和要求的JD。'); return; }
    const next = new AbortController(); controller.current = next;
    eligible.forEach(job => attempted.current.add(attemptKey(job)));
    setBusy(true); setCompleted(0); setTotal(eligible.length); setError(''); setMessage('');
    let saved = 0; let missing = 0;
    try {
      for (let offset = 0; offset < eligible.length; offset += 6) {
        next.signal.throwIfAborted();
        const classify = () => classifyAndSaveJobs(eligible.slice(offset, offset + 6), next.signal, force);
        // Serializing tabs also lets a waiting tab reuse classifications already saved by another tab.
        const result = navigator.locks ? await navigator.locks.request(`jdtool-role-classification-${database.accountId}`, { signal: next.signal }, classify) : await classify();
        saved += result.saved; missing += result.missing;
        await refreshRef.current();
        setCompleted(Math.min(offset + 6, eligible.length));
      }
      if (saved) setMessage(`已自动归类${saved}个岗位，可直接筛选和比较。`);
      if (missing) setError('部分岗位还未完成归类，可稍后重试。');
    } catch {
      if (next.signal.aborted) setMessage('已停止分析，已完成的分类已保存。');
      else setError('部分岗位还未完成归类，可稍后重试。');
    } finally { controller.current = null; setBusy(false); }
  }

  useEffect(() => {
    if (!ready || busy || controller.current) return;
    const pending = jobs.filter(job => needsRoleClassification(job) && !attempted.current.has(attemptKey(job)));
    if (pending.length) void analyze(pending, false);
  }, [jobs, ready, busy]);

  return { busy, completed, total, error, message, analyze, stop: () => controller.current?.abort() };
}

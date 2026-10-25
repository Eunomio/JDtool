'use client';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Job } from '../lib/database';
import { api } from '../lib/client';
import VoiceTextarea from './voice-textarea';
import { Icon } from './ui';
import { AsyncStatus } from './async-status';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = { id: string; role: 'user' | 'assistant'; content: string; suggestions?: string[] };
const markdownComponents: Components = {
  a: ({ children, href, title }) => href ? <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
  table: ({ children }) => <div className="assistant-table"><table>{children}</table></div>,
};
const AssistantMarkdown = memo(function AssistantMarkdown({ content }: { content: string }) { return <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents} skipHtml disallowedElements={['img']}>{content}</Markdown>; });
export default function ProductAssistant({ accountId, page, jobs, selectedJobId, beforeSend }: { accountId: string; page: string; jobs: Job[]; selectedJobId?: string; beforeSend: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [draft, setDraft] = useState(''); const [messages, setMessages] = useState<Message[]>([]);
  const [jobId, setJobId] = useState(selectedJobId || ''); const [excerpt, setExcerpt] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false); const [home, setHome] = useState<HTMLElement | null>(null);
  const [practiceEntry, setPracticeEntry] = useState<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const bottom = useRef<HTMLDivElement>(null); const controller = useRef<AbortController | null>(null); const working = useRef(false); const alive = useRef(true); const quote = useRef('');
  const storageKey = `jdtool-product-chat:${accountId}`;
  useEffect(() => {
    alive.current = true;
    try { const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) setMessages(saved.filter(item => item && ['user','assistant'].includes(item.role) && typeof item.content === 'string' && typeof item.id === 'string').slice(-30)); } catch { /* A new conversation remains available when local history is unavailable. */ }
    setHydrated(true); return () => { alive.current = false; controller.current?.abort(); };
  }, [storageKey]);
  useEffect(() => { if (hydrated) try { sessionStorage.setItem(storageKey, JSON.stringify(messages)); } catch { /* Continue without browser history. */ } }, [messages, hydrated, storageKey]);
  useEffect(() => {
    function locate() { setHome(page === 'home' ? document.getElementById('home-assistant-entry') : null); setPracticeEntry(['interview','scenario'].includes(page) ? document.getElementById('practice-assistant-entry') : null); }
    locate(); if (!open) setJobId(selectedJobId || '');
    const observer = new MutationObserver(locate); const main = document.getElementById('workspace-main'); if (main) observer.observe(main, { childList: true, subtree: true }); return () => observer.disconnect();
  }, [page, selectedJobId]);
  useEffect(() => { if (open && !dialog.current?.open) { if (innerWidth < 768 || innerHeight < 500) dialog.current?.showModal(); else dialog.current?.show(); } if (!open && dialog.current?.open) dialog.current.close(); }, [open]);
  useEffect(() => { if (open) bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages, busy, open]);
  function launch(submit = false) { setExcerpt(quote.current); setOpen(true); setError(''); if (submit && draft.trim()) void send(); }
  function capture() { quote.current = window.getSelection()?.toString().trim().slice(0, 2000) || ''; }
  async function send(retry = false) {
    if (working.current) return;
    const last = messages.at(-1); const question = retry && last?.role === 'user' ? last.content : draft.trim(); if (!question) return;
    const history = (retry ? messages.slice(0,-1) : messages).slice(-8).map(item => ({ role: item.role, content: item.content.slice(0,3000) }));
    if (!retry) { setMessages(items => [...items, { id: crypto.randomUUID(), role: 'user', content: question }].slice(-30) as Message[]); setDraft(''); }
    working.current = true; setBusy(true); setError(''); const request = new AbortController(); controller.current = request;
    try {
      await beforeSend(); request.signal.throwIfAborted();
      const response = await api<{ answer: string; suggestions: string[] }>('/api/chat', { question, history, page, ...(jobId ? { jobId } : {}), ...(excerpt ? { excerpt } : {}) }, { signal: request.signal, quiet: true });
      if (alive.current) setMessages(items => [...items, { id: crypto.randomUUID(), role: 'assistant', content: response.answer, suggestions: response.suggestions }].slice(-30) as Message[]);
    } catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : '这次没有收到回答，可以重试这条提问。'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  const entry = <section className="assistant-home-entry"><div><span className="assistant-entry-icon"><Icon name="sparkles" size={22} /></span><h2>有不明白的内容，问问准备助手</h2></div><div className="assistant-home-compose"><VoiceTextarea aria-label="向准备助手提问" rows={1} autoGrow voiceIconOnly maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} placeholder="解释岗位分析，或理清下一步…" /><button className="primary" disabled={busy} onClick={() => launch(true)}>问一问<Icon name="arrow" size={17} /></button></div></section>;
  const trigger = <button className="assistant-launcher" data-docked={!!practiceEntry} onPointerDown={capture} onClick={() => launch()} aria-label="打开准备助手" title="准备助手"><Icon name="sparkles" size={22} /><span>{busy ? '正在回复' : '准备助手'}</span></button>;
  return <>{home && createPortal(entry, home)}{practiceEntry ? createPortal(trigger, practiceEntry) : !['home','interview','scenario'].includes(page) && trigger}
    <dialog ref={dialog} className="assistant-dialog" aria-labelledby="assistant-heading" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); } }}><header><div><span className="assistant-entry-icon"><Icon name="sparkles" size={22} /></span><div><h2 id="assistant-heading">准备助手</h2><p>读懂分析，理清下一步</p></div></div><button className="secondary" onClick={() => setOpen(false)} aria-label="关闭准备助手">×</button></header>
      <div className="assistant-context"><label>关联岗位<select aria-label="提问关联岗位" value={jobId} disabled={busy} onChange={event => setJobId(event.target.value)}><option value="">产品使用帮助</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.company} · {job.title}</option>)}</select></label><button className="text-button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setError(''); setExcerpt(''); }}>新对话</button></div>
      <div className="assistant-messages" role="log" aria-label="与准备助手的对话" aria-live="polite">{!messages.length && <div className="assistant-welcome"><h3>想先弄清楚什么？</h3>{['这份岗位分析该怎么看？', '项目匹配度是怎么算的？', '我接下来该准备什么？'].map(text => <button key={text} onClick={() => setDraft(text)}>{text}<Icon name="chevron" size={15} /></button>)}</div>}{messages.map(item => <article key={item.id} className={`assistant-message ${item.role}`}><span>{item.role === 'user' ? '我' : '准备助手'}</span><div className={`assistant-message-body${item.role === 'assistant' ? ' assistant-markdown' : ''}`}>{item.role === 'assistant' ? <AssistantMarkdown content={item.content} /> : item.content}</div>{item.role === 'assistant' && item.suggestions?.length ? <div className="assistant-suggestions">{item.suggestions.map(text => <button key={text} disabled={busy} onClick={() => setDraft(text)}>{text}</button>)}</div> : null}</article>)}{busy && <AsyncStatus label="正在查看资料并回答…" onCancel={() => controller.current?.abort()} />}{error && <p role="alert" className="notice error">{error}</p>}{!busy && messages.at(-1)?.role === 'user' && <button className="secondary" onClick={() => void send(true)}>重试这条提问</button>}<div ref={bottom} /></div>
      <footer className="assistant-composer">{excerpt && <details><summary>已选中的内容<button className="text-button" onClick={event => { event.preventDefault(); setExcerpt(''); }}>移除</button></summary><blockquote>{excerpt}</blockquote></details>}<VoiceTextarea aria-label="准备助手提问内容" rows={2} maxLength={4000} voicePresentation="inline" autoGrow value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder="输入你想了解的内容…" disabled={busy} /><button className="primary assistant-send" disabled={busy || !draft.trim()} onClick={() => void send()}>发送<Icon name="arrow" size={17} /></button></footer>
    </dialog></>;
}

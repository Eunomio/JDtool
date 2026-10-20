'use client';

import { useRef, useState, type FormEvent } from 'react';
import { database, type Job } from '../lib/database';
import { prepareImage, type UploadImage } from '../lib/image-upload';
import type { ParsedJob } from '../lib/job-parser';
import { Icon } from './ui';

type Mode = 'link' | 'images' | 'text';
type Draft = ParsedJob & { sourceUrl: string; sourceType: Mode; parsedAt?: string };
function fromJob(job: Job): Draft {
  return { isJobPosting: true, rawText: job.content, title: job.title, company: job.company,
    location: job.location || '', direction: job.direction || '', hiringType: job.hiringType || '',
    responsibilities: job.responsibilities || [], requirements: job.requirements || [], warnings: job.warnings || [],
    sourceUrl: job.sourceUrl || '', sourceType: job.sourceType || 'text', parsedAt: job.parsedAt };
}

export default function JobImporter({ ready, editing, onSaved, onCancel, onOpen }: {
  ready: boolean; editing: Job | null; onSaved: (job: Job) => Promise<void>; onCancel: () => void; onOpen: (job: Job) => void;
}) {
  const [mode, setMode] = useState<Mode>(editing?.sourceType || (editing ? 'text' : 'link'));
  const [url, setUrl] = useState(editing?.sourceUrl || '');
  const [text, setText] = useState(editing?.content || '');
  const [images, setImages] = useState<UploadImage[]>(editing?.images || []);
  const [draft, setDraft] = useState<Draft | null>(editing ? fromJob(editing) : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [duplicate, setDuplicate] = useState<Job | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function addImages(files: File[]) {
    setError('');
    if (images.length + files.length > 3) { setError('每条岗位最多3张截图，请先移除多余图片。'); return; }
    try { const prepared = await Promise.all(files.map(prepareImage)); setImages((current) => [...current, ...prepared].slice(0, 3)); }
    catch (error) { setError(error instanceof Error ? error.message : '截图无法读取。'); }
  }

  async function parse(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (mode === 'link' && !allowDuplicate) {
      const existing = (await database.jobs.toArray()).find((job) => job.id !== editing?.id && job.sourceUrl === url.trim());
      if (existing) { setDuplicate(existing); return; }
    }
    setBusy(true);
    setStage(mode === 'link' ? '正在读取招聘网页并提取岗位内容…' : mode === 'images' ? '正在识别截图文字并提取岗位内容…' : '正在提取岗位职责和要求…');
    try {
      const response = await fetch('/api/jobs/parse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mode, url: url.trim(), text, images: mode === 'images' ? images : undefined }),
        signal: AbortSignal.timeout(180_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || '解析未完成，请重试。');
      setDraft({ ...result.job, sourceUrl: result.sourceUrl, sourceType: result.sourceType, parsedAt: result.parsedAt });
    } catch (error) { setError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : '读取等待较久，请重试或上传截图。'); }
    finally { setBusy(false); setStage(''); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || busy) return;
    setBusy(true); setError('');
    try {
      const now = new Date().toISOString();
      const fields = new FormData(event.currentTarget);
      const entries = (key: 'responsibilities' | 'requirements') => String(fields.get(key) || '').split('\n').map((value) => value.trim()).filter(Boolean).map((value, index) => ({
        id: editing?.[key]?.[index]?.id || crypto.randomUUID(), text: value,
        sourceText: draft[key].find((item) => item.text === value)?.sourceText || '',
      }));
      const job: Job = {
        ...editing, id: editing?.id || crypto.randomUUID(),
        title: String(fields.get('title') || '').trim() || '待补充岗位', company: String(fields.get('company') || '').trim(),
        content: String(fields.get('rawText') || '').trim(), sourceUrl: String(fields.get('sourceUrl') || '').trim(),
        sourceType: draft.sourceType, images: draft.sourceType === 'images' ? images : editing?.images,
        location: String(fields.get('location') || '').trim(), direction: String(fields.get('direction') || '').trim(), hiringType: String(fields.get('hiringType') || '').trim(),
        responsibilities: entries('responsibilities'), requirements: entries('requirements'), warnings: draft.warnings,
        parsedAt: draft.parsedAt, status: editing?.status || '关注中', nextAction: editing?.nextAction || '',
        createdAt: editing?.createdAt || now, updatedAt: now,
      };
      await database.jobs.put(job);
      setDraft(null); setImages([]); setUrl(''); setText(''); setDuplicate(null); setAllowDuplicate(false);
      await onSaved(job);
    } catch { setError('保存失败，校对内容已保留，请重试。'); }
    finally { setBusy(false); }
  }

  if (draft) return <section className="panel import-panel">
    <div className="import-steps" aria-label="添加岗位进度"><span className="done"><Icon name="check" size={13} />提供岗位</span><span aria-current="step"><b>2</b>核对内容</span><span><b>3</b>开始准备</span></div>
    <div className="section-heading"><div><p className="eyebrow">核对岗位内容</p><h2>{editing ? '编辑岗位' : '识别完成，请核对后保存'}</h2></div><div><button className="text-button" disabled={busy} onClick={() => setDraft(null)}>重新解析原始资料</button><button className="text-button" disabled={busy} onClick={() => { if (editing) onCancel(); else setDraft(null); }}>{editing ? '取消编辑' : '返回输入'}</button></div></div>
    {error && <p role="alert" className="notice error">{error}</p>}
    {draft.warnings.length > 0 && <div className="notice">{draft.warnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
    <form onSubmit={save} className="review-layout"><div className="source-preview"><h3>原始资料</h3>{draft.sourceType === 'images' && images.map((image, index) => <img className="source-image" key={index} src={image.dataUrl} alt={`原始JD截图${index + 1}`} />)}<label>岗位原文<textarea name="rawText" rows={18} required defaultValue={draft.rawText} maxLength={60000} /></label></div>
      <div className="review-fields"><label>岗位名称<input name="title" defaultValue={draft.title} maxLength={200} placeholder="未识别到，可补充或保存为草稿" /></label><label>公司名称<input name="company" defaultValue={draft.company} maxLength={200} /></label><div className="field-pair"><label>地点<input name="location" defaultValue={draft.location} maxLength={300} /></label><label>招聘类型<input name="hiringType" defaultValue={draft.hiringType} maxLength={200} /></label></div><label>岗位方向<input name="direction" defaultValue={draft.direction} maxLength={200} placeholder="可修改或自定义方向" /></label><label>岗位职责<textarea name="responsibilities" rows={5} defaultValue={draft.responsibilities.map((item) => item.text).join('\n')} /></label><label>任职要求<textarea name="requirements" rows={5} defaultValue={draft.requirements.map((item) => item.text).join('\n')} /></label><label>来源链接<input name="sourceUrl" type="url" defaultValue={draft.sourceUrl} /></label>
      <details><summary>查看逐条原文依据</summary>{[...draft.responsibilities, ...draft.requirements].map((item, index) => <blockquote key={index}><strong>{item.text}</strong><p>{item.sourceText}</p></blockquote>)}</details>
      <div className="sticky-actions"><button className="primary" disabled={busy || !ready} type="submit">{busy ? '保存中…' : '保存岗位'}</button></div></div>
    </form>
  </section>;

  return <section className="panel import-panel import-start">
    <div className="import-steps" aria-label="添加岗位进度"><span aria-current="step"><b>1</b>提供岗位</span><span><b>2</b>核对内容</span><span><b>3</b>开始准备</span></div>
    <div className="import-intro"><span className="import-symbol"><Icon name={mode === 'images' ? 'image' : 'link'} size={27} /></span><p className="eyebrow">先从你感兴趣的机会开始</p><h2>发来岗位，我们一起拆解。</h2><p className="muted">提供招聘链接或JD截图，自动整理岗位职责和要求。</p></div>
    <div role="tablist" aria-label="岗位输入方式" className="tabs">{([['link', '岗位链接'], ['images', 'JD截图'], ['text', '粘贴正文']] as const).map(([key, title]) => <button key={key} role="tab" aria-selected={mode === key} disabled={busy} onClick={() => { setMode(key); setError(''); }}>{title}</button>)}</div>
    {error && <div className="notice error" role="alert"><p>{error}</p>{mode === 'link' && <div className="actions"><button className="text-button" onClick={() => { setMode('images'); setError(''); }}>改用截图</button><button className="text-button" onClick={() => { setMode('text'); setError(''); }}>粘贴正文</button></div>}</div>}
    {duplicate && <div className="notice">已保存“{duplicate.company} · {duplicate.title}”。<button className="text-button" onClick={() => onOpen(duplicate)}>打开已有岗位</button><button className="text-button" onClick={() => { setAllowDuplicate(true); setDuplicate(null); }}>仍要新增</button></div>}
    <form onSubmit={parse} onPaste={(event) => { if (mode !== 'images' || busy || event.defaultPrevented) return; const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void addImages(files); } }}>
      {mode === 'link' && <label>招聘页面链接<input name="url" type="url" required value={url} onChange={(event) => { setUrl(event.target.value); setAllowDuplicate(false); }} placeholder="粘贴完整的岗位详情页链接" disabled={busy} /></label>}
      {mode === 'images' && <div className="upload-area" tabIndex={0} onPaste={(event) => { const files = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/')); if (files.length) { event.preventDefault(); void addImages(files); } }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) void addImages(Array.from(event.dataTransfer.files)); }}>
        <input ref={inputRef} className="sr-only" aria-label="选择JD截图" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={(event) => { void addImages(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <button type="button" className="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>选择JD截图</button><p className="muted">也可拖入或在此粘贴截图；PNG、JPG、WebP，最多3张。</p>
        <div className="image-grid">{images.map((image, index) => <div key={`${image.name}-${index}`} className="image-item"><img src={image.dataUrl} alt={`JD截图${index + 1}`} /><span>{index + 1}. {image.name}</span><div><button type="button" className="text-button" disabled={busy || index === 0} onClick={() => setImages((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>前移</button><button type="button" className="text-button" disabled={busy} onClick={() => setImages((current) => current.filter((_item, itemIndex) => itemIndex !== index))}>移除</button></div></div>)}</div>
      </div>}
      {mode === 'images' && <label>补充文字（选填）<textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} placeholder="截图中被截断或不清楚的内容，可在这里补充" disabled={busy} /></label>}
      {mode === 'text' && <label>岗位正文<textarea name="text" required rows={8} maxLength={45000} value={text} onChange={(event) => setText(event.target.value)} placeholder="粘贴岗位名称、公司、职责与任职要求" disabled={busy} /></label>}
      <p className="privacy-note">点击解析后，所选文字或截图将用于本次识别，结果保存前可逐项核对。</p>
      <div className="actions"><button className="primary" type="submit" disabled={busy || !ready || (mode === 'images' && !images.length)}>{busy ? '解析中…' : mode === 'link' ? '读取并解析' : mode === 'images' ? '识别并解析截图' : '解析正文'}</button>{mode === 'text' && <button type="button" className="secondary" disabled={busy || !text.trim()} onClick={() => setDraft({ isJobPosting: true, rawText: text, title: '', company: '', location: '', direction: '', hiringType: '', responsibilities: [], requirements: [], warnings: ['请补充岗位字段，保存后可继续编辑。'], sourceUrl: url, sourceType: 'text' })}>手动整理为草稿</button>}</div>
      {busy && <p className="progress-message" role="status">{stage}</p>}
    </form>
  </section>;
}

'use client';
import VoiceTextarea from './voice-textarea';
import { useEffect, useRef, useState } from 'react';
import { database, type CompanyResult, type Job, type Project, type SavedResult, type Source } from '../lib/database';
import { api, inputVersion } from '../lib/client';
import { streamResearch } from '../lib/research-client';
import { CompanyInsights, understandingSections, type UnderstandingTab } from './job-understanding';
import { Icon } from './ui';
import { AsyncStatus } from './async-status';

const steps = ['确定搜索方向', '搜索公开资料', '核对网页来源', '关联岗位职责'];
export default function CompanyResearch({ job, projects, sources, refresh, addTask, autoSearch = true, section = 'business' }: { job: Job; projects: Project[]; sources: Source[]; refresh: () => Promise<void>; addTask: (text: string, ids: string[]) => void; autoSearch?: boolean; section?: UnderstandingTab }) {
  const [saved, setSaved] = useState<SavedResult<CompanyResult> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState('');
  const [queries, setQueries] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [sourceText, setSourceText] = useState(''); const [sourceUrl, setSourceUrl] = useState(''); const [sourceLabel, setSourceLabel] = useState('公司公开资料');
  const controller = useRef<AbortController | null>(null); const attempted = useRef(false);
  const version = inputVersion(job, [], sources);
  useEffect(() => { let cancelled = false; database.companies.where('jobId').equals(job.id).sortBy('createdAt').then((items) => { if (!cancelled) { setSaved(items.at(-1) || null); setLoaded(true); } }); return () => { cancelled = true; controller.current?.abort(); }; }, [job.id]);
  useEffect(() => { if (autoSearch && loaded && (!saved?.data.research || saved.data.research.company !== job.company) && !attempted.current && !job.sample && job.company.trim()) { attempted.current = true; void search(); } }, [autoSearch, loaded, job.id]);
  async function persistSources(items: Source[]) {
    if (items.some((source) => source.url && (!/^https?:\/\//i.test(source.url) || !URL.canParse(source.url)))) throw new Error('请使用完整的公开网页链接。');
    await database.transaction('rw', database.jobs, database.sources, async () => {
      const current = await database.jobs.get(job.id);
      if (!current || inputVersion(current) !== inputVersion(job)) throw new Error('岗位内容已修改，请回到岗位后重新搜索。');
      await database.sources.bulkPut(items);
    });
    await refresh();
  }
  async function search() {
    if (controller.current) return;
    const next = new AbortController(); controller.current = next;
    setBusy(true); setError(''); setStep(0); setProgress('正在整理公司搜索方向');
    try {
      await streamResearch({ id: job.id, title: job.title, company: job.company, direction: job.direction, requirements: job.requirements, responsibilities: job.responsibilities }, next.signal, async (event) => {
        if (next.signal.aborted) return;
        if (event.type === 'progress') { setStep(['planning', 'searching', 'reading', 'analyzing'].indexOf(event.stage)); setProgress(event.message); if (event.queries) setQueries(event.queries); }
        if (event.type === 'sources') await persistSources(event.sources);
        if (event.type === 'result') {
          const record = await database.transaction('rw', database.jobs, database.sources, database.companies, async () => {
            const current = await database.jobs.get(job.id);
            if (!current || inputVersion(current) !== inputVersion(job)) throw new Error('岗位内容已修改，请重新搜索。');
            const all = await database.sources.where('jobId').equals(job.id).toArray();
            const record = { id: crypto.randomUUID(), jobId: job.id, createdAt: new Date().toISOString(), inputVersion: inputVersion(job, [], all), data: event.data };
            await database.companies.put(record); return record;
          });
          setSaved(record); await refresh();
        }
      });
    } catch (error) { if (!next.signal.aborted) setError(error instanceof Error ? error.message : '搜索尚未完成，请重试。'); }
    finally { if (controller.current === next) { controller.current = null; setBusy(false); } }
  }
  async function run(task: () => Promise<void>) { setBusy(true); setError(''); try { await task(); } catch (error) { setError(error instanceof Error ? error.message : '未能完成，请重试。'); } finally { setBusy(false); } }
  const stale = saved && saved.inputVersion !== version;
  return <section data-tour="company-research" className="panel company-research" hidden={section === 'requirements'} aria-labelledby="company-heading"><div className="section-heading"><div><h2 id="company-heading">{understandingSections.find(item => item.id === section)?.label || '公司与业务'}</h2>{!job.company.trim() && <p className="muted">请先补充公司名称。</p>}</div><button className={saved ? 'secondary' : 'primary'} disabled={busy || !loaded || !job.company.trim()} onClick={search}><Icon name="search" size={16} />{busy ? '正在研究公司…' : saved ? '更新公司研究' : '搜索公司业务'}</button></div>
    {busy && controller.current && <div className="research-progress" role="status"><div className="research-steps">{steps.map((label, index) => <span key={label} className={step === index ? 'current' : step > index ? 'done' : ''}><b>{step > index ? <Icon name="check" size={12} /> : index + 1}</b>{label}</span>)}</div><AsyncStatus label={progress || '正在整理公司资料'} />{queries.map((query) => <small key={query}>{query}</small>)}<button className="text-button" onClick={() => { controller.current?.abort(); setProgress(''); }}>停止搜索</button></div>}
    {error && <div className="notice error" role="alert">{error}<button className="text-button" disabled={busy} onClick={search}>重试搜索</button></div>}
    {!saved && section !== 'requirements' && <div role="tabpanel" id={`岗位与公司内容-panel-${section}`} aria-labelledby={`岗位与公司内容-${section}`}>{!busy && !error && <div className="research-empty"><Icon name="globe" size={36} /><div><h3>查看公司业务和岗位关联</h3><p>搜索公开资料后，可分别查看公司业务、岗位准备建议和面试问题。</p></div></div>}</div>}
    {saved && <>{stale && <div className="notice">岗位或资料已更新，可以更新公司研究后继续准备。</div>}<CompanyInsights section={section} data={saved.data} createdAt={saved.createdAt} job={job} projects={projects} sources={sources} addTask={text => addTask(text, [job.id])} /></>}
    <details className="source-library"><summary>查看来源与补充公司资料 <span className="count">{sources.length}</span></summary><div className="source-cards">{sources.map((source) => <article className="source-card" key={source.id}><div className="source-domain"><Icon name="link" size={14} />{source.url && URL.canParse(source.url) ? new URL(source.url).hostname : '补充资料'}<span>{source.kind === 'snippet' ? '搜索摘要' : source.kind === 'web' ? '已读取网页' : '手动补充'}</span></div><h3>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a> : source.label}</h3><small className="muted">读取于 {new Date(source.collectedAt).toLocaleDateString('zh-CN')}{source.publishedAt ? ` · 页面标注时间：${source.publishedAt}` : ''}</small><details><summary>查看资料内容</summary><pre className="source-text">{source.text}</pre><button className="text-button danger" disabled={busy} onClick={() => run(async () => { await database.sources.delete(source.id); await refresh(); })}>移除这条资料</button></details></article>)}</div>
    <div className="manual-source"><h3>补充你找到的资料</h3><div className="field-pair"><label>资料名称<input value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} /></label><label>公开网页链接<input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label></div><label>资料正文<VoiceTextarea rows={4} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder="粘贴公司官网或产品介绍，也可读取上方链接" /></label><div className="actions"><button className="secondary" disabled={busy || !sourceUrl} onClick={() => run(async () => { const source = await api<{ text: string }>('/api/sources/extract', { url: sourceUrl }); setSourceText(source.text); })}>读取公开网页</button><button className="secondary" disabled={busy || !sourceText.trim()} onClick={() => run(async () => { await persistSources([{ id: crypto.randomUUID(), jobId: job.id, label: sourceLabel || '补充公开资料', url: sourceUrl, text: sourceText, collectedAt: new Date().toISOString() }]); setSourceText(''); setSourceUrl(''); })}>保存资料</button><button className="text-button" disabled={busy || !sources.length} onClick={() => run(async () => { const data = await api<CompanyResult>('/api/assist', { action: 'company', job, sources: sources.slice(0, 15) }); const record = { id: crypto.randomUUID(), jobId: job.id, inputVersion: version, createdAt: new Date().toISOString(), data }; await database.companies.put(record); setSaved(record); })}>分析已保存资料</button></div></div></details>
  </section>;
}

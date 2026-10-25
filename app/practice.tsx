'use client';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import VoiceTextarea from './voice-textarea';
import { database, type Job, type PracticeFeedback, type Source } from '../lib/database';
import { api, copyText, inputVersion } from '../lib/client';
import { exerciseFor, type Exercise, type PracticeExample } from '../lib/exercises';
import { emptyPractice, moveText, restorePractice, taskSubmitted, type PendingMessage, type PracticeState } from '../lib/practice-conversation';
import { Icon } from './ui';
import PracticeReview from './practice-review';
import ColleagueMessage from './colleague-message';
import { AsyncStatus } from './async-status';
import PracticeScreen from './practice-screen';
import PracticeBrief from './practice-brief';
import ChatMessage from './chat-message';
import { cachePracticeDraft, clearSavedPracticeDraft, recoverPracticeDraft } from '../lib/practice-drafts';

export function PracticeLaunch({ onPractice }: { onPractice: (mode: 'interview' | 'scenario') => void }) {
  return <div data-tour="practice-launch" className="practice-launch-grid"><button className="practice-launch" onClick={() => onPractice('interview')}><Icon name="interview" size={26} /><h3>模拟面试</h3><span>开始本轮面试 <Icon name="arrow" size={16} /></span></button><button className="practice-launch" onClick={() => onPractice('scenario')}><Icon name="scenario" size={26} /><h3>体验岗位一天</h3><span>开始工作任务 <Icon name="arrow" size={16} /></span></button></div>;
}
export function PracticeSelector({ jobs, selectedId, onSelect }: { jobs: Job[]; selectedId: string; onSelect: (id: string) => void }) {
  return <label className="practice-selector">选择目标岗位<select aria-label="选择目标岗位" value={selectedId} onChange={event => onSelect(event.target.value)}><option value="" disabled>请选择岗位</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.company} · {job.title}</option>)}</select></label>;
}

export default function Practice({ job, mode, sources, addTask, refresh, example, onNextAction, onExit, openReview = false }: { job: Job; mode: 'interview' | 'scenario'; sources: Source[]; addTask: (text: string, jobIds: string[]) => void; refresh: () => Promise<void>; example?: PracticeExample; onNextAction?: (text: string) => void; onExit?: () => void; openReview?: boolean }) {
  const [state, setState] = useState<PracticeState>(emptyPractice); const latest = useRef(state);
  const [loaded, setLoaded] = useState(false); const ready = useRef(false); const alive = useRef(true);
  const [busy, setBusy] = useState(false); const working = useRef(false); const [busyLabel, setBusyLabel] = useState('正在准备练习内容');
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [sendMode, setSendMode] = useState<'question' | 'plan'>('question'); const [contact, setContact] = useState(''); const [showContacts, setShowContacts] = useState(false);
  const [materials, setMaterials] = useState(false); const materialDialog = useRef<HTMLDialogElement>(null);
  const ongoing = useRef<AbortController | null>(null); const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const writes = useRef(Promise.resolve());
  const savedVersion = useRef(''); const messages = useRef<HTMLDivElement>(null); const atBottom = useRef(true); const [newMessages, setNewMessages] = useState(false);
  const jobSources = sources.filter(source => source.jobId === job.id); const version = inputVersion(job, [], jobSources); const sessionId = `${mode}-${job.id}`;
  const exercise = state.exercise || (job.sample ? exerciseFor(job) : null); const current = exercise?.nodes[state.node];
  function startState(): PracticeState { return { ...emptyPractice(), ...(example ? { exercise: example.exercise, answer: example.answer, supplement: example.supplement } : {}) }; }
  function update(next: PracticeState) { latest.current = next; if (alive.current) setState(next); }
  function store(next: PracticeState, exerciseVersion = savedVersion.current || version) {
    if (example) return Promise.resolve();
    const record = { id: sessionId, jobId: job.id, type: mode, inputVersion: exerciseVersion, data: structuredClone(next) as unknown as Record<string, unknown>, updatedAt: new Date().toISOString() };
    const write = writes.current.catch(() => {}).then(() => database.transaction('rw', database.jobs, database.practice, async () => { if (!await database.jobs.get(job.id)) throw Error('岗位已删除，这次练习未保存。'); await database.practice.put(record); }));
    writes.current = write; return write.then(() => { clearSavedPracticeDraft(database.accountId, sessionId, next); });
  }
  async function persist(next: PracticeState, exerciseVersion = savedVersion.current || version) {
    if (!alive.current) return;
    clearTimeout(draftTimer.current); const hadFeedback = !!latest.current.feedback; update(next); savedVersion.current = exerciseVersion;
    await store(next, exerciseVersion); if (!example && (!!next.feedback || hadFeedback)) await refresh();
  }
  function draft(field: 'answer' | 'supplement' | 'question' | 'choice', text: string) {
    const next = { ...latest.current, [field]: text }; update(next); if (!example) cachePracticeDraft(database.accountId, sessionId, savedVersion.current || version, next); clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { void store(latest.current).catch(() => { if (alive.current) setError('草稿尚未保存，请重试。'); }); }, 400);
  }
  function flushDraft() { clearTimeout(draftTimer.current); return ready.current ? store(latest.current) : Promise.resolve(); }
  async function request<T>(input: unknown): Promise<T> { if (!alive.current) throw new DOMException('cancelled', 'AbortError'); const controller = new AbortController(); ongoing.current = controller; const result = await api<T>('/api/assist', input, { signal: controller.signal }); controller.signal.throwIfAborted(); return result; }
  async function run(action: () => Promise<void>, label: string) {
    if (working.current) return; working.current = true; setBusy(true); setBusyLabel(label); setError(''); setMessage('');
    try { await action(); } catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : '本次未完成，请重试。'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true; let cancelled = false;
    async function load() {
      try {
        const session = example ? null : await database.practice.get(sessionId); if (cancelled) return;
        if (session) { const next = recoverPracticeDraft(database.accountId, sessionId, session.inputVersion, session.updatedAt, restorePractice(session.data)); update(openReview && next.feedback ? { ...next, reviewOpen: true } : next); savedVersion.current = session.inputVersion; }
        else { update(example ? startState() : recoverPracticeDraft(database.accountId, sessionId, version, '', startState())); savedVersion.current = version; }
        ready.current = true; setLoaded(true);
        if (!session && !example && !job.sample) await regenerate(false);
      } catch { if (!cancelled) { setError('练习尚未读取，请刷新后重试。'); setLoaded(true); } }
    }
    void load();
    return () => { cancelled = true; alive.current = false; ongoing.current?.abort(); clearTimeout(draftTimer.current); if (ready.current) void store(latest.current).catch(() => {}); };
  }, [sessionId]);
  useEffect(() => { if (current?.colleague) setContact(current.colleague); }, [current?.colleague, state.node]);
  useEffect(() => { if (materials) materialDialog.current?.showModal(); }, [materials]);
  function jumpToLatest() { const node = messages.current; if (node) node.scrollTop = node.scrollHeight; atBottom.current = true; setNewMessages(false); }
  useLayoutEffect(() => {
    if (atBottom.current) jumpToLatest(); else setNewMessages(true);
  }, [state.followup, state.moves.length, state.pendingMessage, state.feedback, state.node, contact, busy, state.reviewOpen]);
  async function regenerate(confirm = true) {
    if (confirm && (latest.current.answer || latest.current.moves.length) && !window.confirm('按当前JD重新准备练习？本轮回答和复盘将被替换。')) return;
    await run(async () => { const next = example?.exercise || await request<Exercise>({ action: 'exercise', mode, job, sources: jobSources }); await persist({ ...startState(), exercise: next }, version); setSendMode('question'); atBottom.current = true; }, mode === 'interview' ? '正在根据岗位准备面试题' : '正在根据岗位准备两项工作任务');
  }
  async function restart() {
    if (!window.confirm('重新开始这次练习？当前回答和复盘将被替换。')) return;
    if (savedVersion.current !== version || !exercise) { await regenerate(false); return; }
    await persist({ ...startState(), exercise }); setSendMode('question'); setError(''); setMessage(''); atBottom.current = true;
  }
  async function send(pending: PendingMessage) {
    atBottom.current = true;
    await run(async () => {
      await persist({ ...latest.current, pendingMessage: pending });
      if (mode === 'interview') {
        const stage = pending.kind === 'answer' ? 'followup' : 'review'; const snapshot = latest.current;
        const result = example ? { followup: example.followup, feedback: stage === 'review' ? example.feedback : null } : await request<{ followup: string; feedback: PracticeFeedback | null }>({ action: 'interview', job, sources: jobSources, stage, context: JSON.stringify(exercise), answer: snapshot.answer, followup: snapshot.followup, supplement: snapshot.supplement });
        if (stage === 'followup' && !result.followup?.trim() || stage === 'review' && !result.feedback) throw Error('本次回复尚未完整生成，请重试。');
        await persist({ ...latest.current, pendingMessage: undefined, followup: stage === 'followup' ? result.followup : snapshot.followup, feedback: result.feedback, reviewOpen: false });
      } else {
        const stage = pending.kind === 'question' ? 'dialogue' : 'decision';
        const result = example ? { dialogue: stage === 'dialogue' ? example.colleagueReply : example.responses[pending.node]?.dialogue || '', consequence: stage === 'decision' ? example.responses[pending.node]?.consequence || '' : '' } : await request<{ dialogue: string; consequence: string }>({ action: 'scenario', job, sources: jobSources, stage, context: JSON.stringify({ exercise, currentNode: pending.node, history: latest.current.moves }), answer: pending.text });
        if (!result.dialogue?.trim()) throw Error('本次回复尚未完整生成，请重试。');
        await persist({ ...latest.current, pendingMessage: undefined, [stage === 'dialogue' ? 'question' : 'choice']: '', response: result, moves: [...latest.current.moves, { node: pending.node, kind: stage === 'dialogue' ? 'question' : 'plan', colleague: exercise!.nodes[pending.node].colleague, action: stage === 'dialogue' ? `向同事提问：${pending.text}` : pending.text, dialogue: result.dialogue, consequence: result.consequence }] });
      }
    }, mode === 'interview' ? pending.kind === 'answer' ? '正在准备追问' : '正在整理面试复盘' : '正在回复你的消息');
  }
  async function scenarioReview() {
    if (state.feedback) { await persist({ ...latest.current, reviewOpen: true }); return; }
    await run(async () => { const result = example ? { feedback: example.scenarioFeedback } : await request<{ feedback: PracticeFeedback | null }>({ action: 'scenario', job, sources: jobSources, stage: 'review', context: JSON.stringify({ exercise, currentNode: state.node, history: state.moves }), answer: '' }); if (!result.feedback) throw Error('复盘尚未完整生成，请重试。'); await persist({ ...latest.current, feedback: result.feedback, reviewOpen: true }); }, '正在整理工作复盘');
  }
  const pending = state.pendingMessage; const submitted = taskSubmitted(state); const isCurrentContact = !contact || contact === current?.colleague;
  const field = mode === 'interview' ? state.followup ? 'supplement' : 'answer' : sendMode === 'question' ? 'question' : 'choice';
  const label = mode === 'interview' ? state.followup ? '补充回答' : '我的回答' : sendMode === 'question' ? `向${current?.colleague || '同事'}提问` : '我的方案';
  function submit() { if (busy || !loaded || pending || state.feedback || mode === 'scenario' && (submitted || !isCurrentContact)) return; const text = latest.current[field].trim(); if (text) void send({ node: state.node, kind: mode === 'interview' ? state.followup ? 'supplement' : 'answer' : sendMode, text }); }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }
  const phase = busy ? busyLabel : state.feedback ? '本轮已完成' : mode === 'interview' ? state.followup ? '补充回答' : '回答问题' : `任务 ${state.node + 1} / ${exercise?.nodes.length || 2}`;
  const tools = <div className="conversation-tools"><button className="secondary small" aria-label="查看岗位资料" onClick={() => setMaterials(true)}><Icon name="projects" size={16} /><span>资料</span></button><details className="practice-menu"><summary aria-label="练习选项"><Icon name="menu" size={18} /></summary><div><button disabled={busy || !loaded} onClick={event => { event.currentTarget.closest('details')!.open = false; void restart(); }}>重新开始</button><button disabled={busy || !loaded} onClick={event => { event.currentTarget.closest('details')!.open = false; void regenerate(); }}>按当前JD调整题目与任务</button>{onExit && <button onClick={() => { void flushDraft().then(onExit).catch(() => setError('草稿尚未保存，请稍后重试。')); }}>暂存退出</button>}</div></details></div>;
  const contacts = mode === 'scenario' && exercise ? [...new Set(exercise.nodes.slice(0, state.node + 1).map(node => node.colleague))] : [];
  const sidebar = mode === 'scenario' && exercise ? <aside className="office-contacts" data-open={showContacts} aria-label="工作会话"><div className="office-contacts-heading"><Icon name="interview" size={19} /><strong>消息</strong><button className="text-button contacts-close" onClick={() => setShowContacts(false)} aria-label="关闭会话列表">×</button></div>{contacts.map(name => { const last = state.moves.filter(move => (move.colleague || exercise.nodes[move.node]?.colleague) === name).at(-1); return <button className={`office-contact ${contact === name ? 'selected' : ''}`} key={name} aria-pressed={contact === name} onClick={() => { setContact(name); setShowContacts(false); if (latest.current.reviewOpen) void persist({ ...latest.current, reviewOpen: false }); atBottom.current = true; }}><span className="office-contact-avatar">{name.slice(0, 1)}</span><span><strong>{name}</strong><small>{last ? last.dialogue : exercise.nodes.find(node => node.colleague === name)?.title}</small></span>{name === current?.colleague && !submitted && <i aria-label="当前任务" />}</button>; })}<div className="office-task-progress"><span>本轮任务</span>{exercise.nodes.map((node, index) => <span key={index} className={index === state.node ? 'current' : ''}><Icon name={taskSubmitted(state, index) ? 'check' : 'flag'} size={14} />{index < state.node || taskSubmitted(state, index) ? '已提交' : index === state.node ? '进行中' : '待处理'} · {node.title}</span>)}</div></aside> : undefined;
  const panel = (content: ReactNode) => <section data-tour={mode === 'interview' ? 'interview-practice' : 'scenario-practice'} className="practice conversation-practice"><PracticeScreen mode={mode} company={job.company} title={job.title} phase={phase} sidebar={sidebar} tools={tools}>{content}</PracticeScreen></section>;
  const materialView = materials && <dialog className="practice-material-dialog" ref={materialDialog} aria-labelledby="practice-material-title" onCancel={() => setMaterials(false)} onClose={() => setMaterials(false)}><header><h2 id="practice-material-title">岗位与工作资料</h2><button className="secondary small" onClick={() => setMaterials(false)}>关闭资料</button></header><div>{exercise?.dimensions.length ? <section><h3>本轮练习重点</h3><div className="tag-row">{exercise.dimensions.map(text => <span className="tag" key={text}>{text}</span>)}</div></section> : null}<section><h3>岗位要求</h3>{[...(job.requirements || []), ...(job.responsibilities || [])].map(item => <blockquote key={item.id}>{item.sourceText || item.text}</blockquote>)}<details><summary>查看完整JD</summary><p className="preserve-lines">{job.content}</p></details></section><section><h3>公司资料</h3>{jobSources.length ? jobSources.map(source => <details key={source.id}><summary>{source.label}</summary><p className="preserve-lines">{source.text}</p>{/^https?:\/\//.test(source.url) && <a href={source.url} target="_blank" rel="noreferrer">查看来源</a>}</details>) : <p>还没有补充公司资料。</p>}</section></div></dialog>;
  const notices = <>{savedVersion.current && savedVersion.current !== version && <div className="chat-notice">岗位或公司资料已更新，这份记录来自更新前的练习，可重新开始。</div>}{message && <div className="chat-notice" role="status">{message}</div>}{error && <div className="chat-notice error" role="alert">{error}</div>}</>;
  if (!exercise) return <>{panel(<div className="chat-loading">{notices}{busy || !loaded ? <><AsyncStatus label={busyLabel} onCancel={() => ongoing.current?.abort()} /><div className="practice-skeleton" aria-hidden="true"><i /><i /><i /></div></> : <><p>题目尚未准备好，请重试。</p><button className="primary" onClick={() => void regenerate()}>重新准备题目</button></>}</div>)}{materialView}</>;
  return <>{panel(state.feedback && state.reviewOpen ? <div className="chat-review-page">{notices}<button className="secondary small" onClick={() => void persist({ ...latest.current, reviewOpen: false })}>返回对话</button><PracticeReview feedback={state.feedback} job={job} mode={mode} onCopy={() => { void copyText(state.feedback!.outline.join('\n')).then(() => setMessage('已复制提纲。')).catch(() => setError('复制未完成，请重试。')); }} onAdd={text => addTask(text, [job.id])} onNext={text => void run(async () => { if (example) onNextAction?.(text); else { await database.jobs.update(job.id, { nextAction: text, updatedAt: new Date().toISOString() }); await refresh(); } setMessage('已设为这个岗位的下一步行动。'); }, '正在保存下一步行动')} /></div> : <>
    <PracticeBrief mode={mode} background={exercise.background} task={current} index={state.node} count={exercise.nodes.length} />
    <div className="chat-session-header">{mode === 'scenario' && <button className="secondary small contacts-toggle" aria-expanded={showContacts} onClick={() => setShowContacts(value => !value)}><Icon name="menu" size={16} />会话</button>}<span className="chat-partner-avatar"><Icon name="interview" size={17} /></span><div><strong>{mode === 'interview' ? '面试官' : contact || current?.colleague}</strong><span>{mode === 'interview' ? '岗位问答' : '私聊'}</span></div><span className="chat-session-stage">{mode === 'interview' ? state.followup ? '追问' : '首次回答' : `第${state.node + 1}项任务`}</span></div>
    <div ref={messages} className="chat-messages" role="log" aria-label={mode === 'interview' ? '面试对话' : '工作对话'} aria-live="polite" aria-relevant="additions text" tabIndex={0} onScroll={() => { const node = messages.current; if (node) { atBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; if (atBottom.current) setNewMessages(false); } }}>
      {mode === 'interview' ? <>
        <div className="chat-divider">本轮面试</div>
        <ChatMessage name="面试官" className="chat-question"><p>{exercise.question}</p></ChatMessage>
        {(state.followup || state.feedback || pending?.kind === 'answer') && <ChatMessage name="我" own status={pending?.kind === 'answer' ? busy ? '正在发送' : '尚未收到回复' : undefined}><p>{state.answer}</p></ChatMessage>}
        {state.followup && <ChatMessage name="面试官"><span className="chat-message-label">面试官追问</span><p>{state.followup}</p></ChatMessage>}
        {(state.feedback || pending?.kind === 'supplement') && <ChatMessage name="我" own status={pending?.kind === 'supplement' ? busy ? '正在发送' : '尚未收到回复' : undefined}><p>{state.supplement}</p></ChatMessage>}
      </> : exercise.nodes.slice(0, state.node + 1).map((node, index) => node.colleague === (contact || current?.colleague) && <div className="chat-task-history" key={index}><div className="chat-divider">任务 {String(index + 1).padStart(2, '0')} · {node.title}</div><ColleagueMessage colleague={node.colleague} text={node.situation} />{state.moves.filter(move => move.node === index).map((move, moveIndex) => <div className="work-exchange" key={moveIndex}><ChatMessage name="我" own><p>{moveText(move)}</p></ChatMessage><ColleagueMessage colleague={node.colleague} text={move.dialogue} reply />{move.consequence && <details className="work-impact"><summary>查看方案取舍</summary><p>{move.consequence}</p></details>}</div>)}{pending?.node === index && <ChatMessage name="我" own status={busy ? '正在发送' : '尚未收到回复'}><p>{pending.text}</p></ChatMessage>}</div>)}
      {busy && <div className="chat-reply-status"><AsyncStatus label={busyLabel} onCancel={() => ongoing.current?.abort()} /></div>}
      {state.feedback && <div className="chat-completed"><Icon name="check" size={22} /><strong>{mode === 'interview' ? '本轮面试已完成' : '两项任务已完成'}</strong></div>}
    </div>
    {newMessages && <button className="chat-new-messages secondary small" onClick={jumpToLatest}>查看最新消息<Icon name="chevron" size={14} /></button>}
    <div className="chat-composer" data-tour="chat-composer">{notices}{pending ? <div className="chat-pending-actions">{!busy && <><span>消息已保留，可以重试或修改。</span><button className="primary" onClick={() => void send(pending)}>重试回复</button><button className="secondary" onClick={() => { if (mode === 'scenario') { setSendMode(pending.kind === 'plan' ? 'plan' : 'question'); setContact(exercise.nodes[pending.node].colleague); } void persist({ ...latest.current, pendingMessage: undefined }).then(() => setError('')); }}>修改消息</button></>}</div> : state.feedback ? <div className="chat-finished-actions"><span>回答与复盘已保存</span><button className="primary" onClick={() => void persist({ ...latest.current, reviewOpen: true })}>查看本轮复盘</button></div> : mode === 'scenario' && !isCurrentContact ? <div className="chat-finished-actions"><span>这段会话已保留</span><button className="primary" onClick={() => { setContact(current!.colleague); atBottom.current = true; }}>回到当前会话</button></div> : mode === 'scenario' && submitted ? <div className="chat-finished-actions"><div><strong>本项方案已提交</strong><span>{state.node === 0 ? '继续处理下一项任务' : '本轮两项任务已完成'}</span></div><button className="primary" disabled={busy} onClick={() => state.node === 0 ? void persist({ ...latest.current, node: 1, choice: '', question: '', response: null }).then(() => { setSendMode('question'); atBottom.current = true; }) : void scenarioReview()}>{state.node === 0 ? '继续下一项任务' : '查看任务复盘'}<Icon name="arrow" size={15} /></button></div> : <>
      {mode === 'scenario' && <div className="composer-modes" role="tablist" aria-label="沟通方式" onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'question' : event.key === 'End' ? 'plan' : sendMode === 'question' ? 'plan' : 'question'; setSendMode(next); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next === 'plan' ? 1 : 0]?.focus(); } }}> <button role="tab" aria-selected={sendMode === 'question'} onClick={() => setSendMode('question')}>了解情况</button><button role="tab" aria-selected={sendMode === 'plan'} onClick={() => setSendMode('plan')}>提交方案</button>{current && <details className="reference-replies"><summary>参考处理思路</summary><div>{current.choices.map((choice, index) => <button key={index} onClick={() => { draft('choice', choice); setSendMode('plan'); const detail = document.querySelector<HTMLDetailsElement>('.reference-replies'); if (detail) detail.open = false; }}>{choice}</button>)}</div></details>}</div>}
      <label className="composer-field"><span className="sr-only">{label}</span><VoiceTextarea key={field} aria-label={label} voicePresentation="inline" autoGrow rows={mode === 'interview' ? 3 : sendMode === 'question' ? 1 : 2} maxLength={field === 'question' ? 2000 : 20000} value={state[field]} disabled={!loaded || busy} onChange={event => draft(field, event.target.value)} onBlur={() => { void flushDraft().catch(() => setError('草稿尚未保存，请重试。')); }} onKeyDown={keyDown} placeholder={mode === 'interview' ? state.followup ? '回应面试官的追问…' : '输入你的回答，或使用语音输入…' : sendMode === 'question' ? '向同事了解情况…' : '写下你的处理方案与理由…'} /></label>
      <div className="composer-actions"><span>Ctrl / ⌘ + Enter 发送</span><button className="primary" disabled={!loaded || busy || !state[field].trim()} aria-label={mode === 'interview' ? state.followup ? '提交补充，查看复盘' : '提交回答，获得追问' : sendMode === 'question' ? '发送问题' : '提交方案'} onClick={submit}>发送<Icon name="arrow" size={16} /></button></div>
    </>}</div>
  </>)}{materialView}</>;
}

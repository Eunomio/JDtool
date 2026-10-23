'use client';
import VoiceTextarea from './voice-textarea';
import { useEffect, useRef, useState } from 'react';
import { database, type Job, type PracticeFeedback, type Source } from '../lib/database';
import { api, copyText, inputVersion } from '../lib/client';
import { exerciseFor, type Exercise, type PracticeExample } from '../lib/exercises';
import { Icon } from './ui';
import PracticeReview from './practice-review';
import ColleagueMessage from './colleague-message';
import { AsyncStatus } from './async-status';
import PracticeScreen from './practice-screen';

type State = { exercise?: Exercise; answer: string; followup: string; supplement: string; feedback: PracticeFeedback | null; node: number; moves: { node: number; action: string; dialogue: string; consequence: string }[]; choice: string; question: string; response: { dialogue: string; consequence: string } | null };
const initial: State = { answer: '', followup: '', supplement: '', feedback: null, node: 0, moves: [], choice: '', question: '', response: null };

export function PracticeLaunch({ onPractice }: { onPractice: (mode: 'interview' | 'scenario') => void }) {
  return <div data-tour="practice-launch" className="practice-launch-grid"><button className="practice-launch" onClick={() => onPractice('interview')}><Icon name="interview" size={26} /><h3>模拟面试</h3><span>开始本轮面试 <Icon name="arrow" size={16} /></span></button><button className="practice-launch" onClick={() => onPractice('scenario')}><Icon name="scenario" size={26} /><h3>体验岗位一天</h3><span>开始工作任务 <Icon name="arrow" size={16} /></span></button></div>;
}
export function PracticeSelector({ jobs, selectedId, onSelect }: { jobs: Job[]; selectedId: string; onSelect: (id: string) => void }) {
  return <label className="practice-selector">选择目标岗位<select value={selectedId} onChange={event => onSelect(event.target.value)}><option value="" disabled>请选择岗位</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.company} · {job.title}</option>)}</select></label>;
}

export default function Practice({ job, mode, sources, addTask, refresh, example, onNextAction }: { job: Job; mode: 'interview' | 'scenario'; sources: Source[]; addTask: (text: string, jobIds: string[]) => void; refresh: () => Promise<void>; example?: PracticeExample; onNextAction?: (text: string) => void }) {
  const [state, setState] = useState<State>(initial);
  const [loaded, setLoaded] = useState(false);
  const [savedVersion, setSavedVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('正在准备练习内容');
  const ongoing = useRef<AbortController | null>(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ongoing.current?.abort(); }; }, []);
  async function request<T>(input: unknown): Promise<T> { const controller = new AbortController(); ongoing.current = controller; const result = await api<T>('/api/assist', input, { signal: controller.signal }); controller.signal.throwIfAborted(); return result; }
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const exercise = state.exercise || (job.sample ? exerciseFor(job) : null);
  const jobSources = sources.filter((source) => source.jobId === job.id);
  const version = inputVersion(job, [], jobSources);
  const sessionId = `${mode}-${job.id}`;
  function startState() { return { ...structuredClone(initial), ...(example ? { exercise: example.exercise, answer: example.answer, supplement: example.supplement } : {}) }; }
  async function prepareExercise() { return example?.exercise || await request<Exercise>({ action: 'exercise', mode, job, sources: jobSources }); }
  useEffect(() => {
    if (example) { setState(startState()); setSavedVersion(version); setLoaded(true); return; }
    let cancelled = false; database.practice.get(sessionId).then(async (session) => {
    if (cancelled) return;
    if (session) { setState(session.data as unknown as State); setSavedVersion(session.inputVersion); }
    else if (!job.sample) {
      setBusy(true); setBusyLabel(mode === 'interview' ? '正在根据岗位准备面试题' : '正在根据岗位准备两项工作任务');
      try { const exercise = await request<Exercise>({ action: 'exercise', mode, job, sources: jobSources }); if (!cancelled) await persist({ ...startState(), exercise }); }
      catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : '题目尚未生成，可稍后按当前JD重试。'); }
      finally { if (!cancelled) setBusy(false); }
    }
    if (!cancelled) setLoaded(true);
  }); return () => { cancelled = true; ongoing.current?.abort(); }; }, [sessionId]);
  async function persist(next: State, exerciseVersion = savedVersion || version) { if (!mounted.current) return; setState(next); if (!example) await database.practice.put({ id: sessionId, jobId: job.id, type: mode, inputVersion: exerciseVersion, data: next as unknown as Record<string, unknown>, updatedAt: new Date().toISOString() }); if (!example && (next.feedback || state.feedback)) await refresh(); setSavedVersion(exerciseVersion); }
  function saveDraft() { void persist(state).catch(() => setError('回答尚未保存，请重试。')); }
  async function run(task: () => Promise<void>, label = '正在处理练习内容') { setBusyLabel(label); setBusy(true); setError(''); setMessage(''); try { await task(); } catch (error) { setError(error instanceof Error ? error.message : '本次未完成，回答已保留，请重试。'); } finally { setBusy(false); } }
  async function customize() { await run(async () => { const exercise = await prepareExercise(); await persist({ ...startState(), exercise }, version); }, mode === 'interview' ? '正在根据岗位准备面试题' : '正在根据岗位准备两项工作任务'); }
  const current = exercise?.nodes[state.node];
  async function interview(stage: 'followup' | 'review') { await run(async () => { const result = example ? { followup: example.followup, feedback: stage === 'review' ? example.feedback : null } : await request<{ followup: string; feedback: PracticeFeedback | null }>( { action: 'interview', job, sources: jobSources, stage, context: JSON.stringify(exercise), answer: state.answer, followup: state.followup, supplement: state.supplement }); await persist({ ...state, followup: stage === 'followup' ? result.followup : state.followup, feedback: result.feedback }); }, stage === 'review' ? '正在整理面试复盘' : '正在阅读回答并准备追问'); }
  async function scenario(stage: 'dialogue' | 'decision' | 'review') {
    await run(async () => {
      const result = example ? { dialogue: stage === 'dialogue' ? example.colleagueReply : example.responses[state.node]?.dialogue || '', consequence: stage === 'decision' ? example.responses[state.node]?.consequence || '' : '', feedback: stage === 'review' ? example.scenarioFeedback : null } : await request<{ dialogue: string; consequence: string; feedback: PracticeFeedback | null }>( { action: 'scenario', job, sources: jobSources, stage, context: JSON.stringify({ exercise, currentNode: state.node, history: state.moves }), answer: stage === 'dialogue' ? state.question : state.choice });
      if (stage === 'review') await persist({ ...state, feedback: result.feedback });
      else if (stage === 'dialogue') { await persist({ ...state, question: '', response: { dialogue: result.dialogue, consequence: '' }, moves: [...state.moves, { node: state.node, action: `向同事提问：${state.question}`, dialogue: result.dialogue, consequence: '' }] }); }
      else await persist({ ...state, response: result, moves: [...state.moves, { node: state.node, action: state.choice, dialogue: result.dialogue, consequence: result.consequence }] });
    }, stage === 'review' ? '正在整理工作复盘' : '正在根据你的回应整理反馈');
  }
  const phase = busy ? busyLabel : state.feedback ? '复盘已保存' : mode === 'interview' ? state.followup ? '补充回答' : '回答问题' : `任务 ${state.node + 1} / 2`;
  const room = (content: React.ReactNode) => <PracticeScreen mode={mode} company={job.company} title={job.title} phase={phase}>{content}</PracticeScreen>;
  if (!exercise) return room(<section className="panel practice"><h1>{mode === 'interview' ? '模拟面试' : '体验岗位一天'}</h1><p>{job.company} · {job.title}</p>{error && <p className="notice error" role="alert">{error}</p>}{busy ? <><AsyncStatus label={busyLabel} /><div className="practice-skeleton" aria-hidden="true"><i /><i /><i /></div></> : <p role="status">题目尚未准备好，请重试。</p>}<button className="primary" disabled={busy || !loaded} onClick={() => { if ((!state.answer && !state.moves.length) || window.confirm('重新准备题目会替换这次练习，继续吗？')) void customize(); }}>重新准备题目</button></section>);
  return room(<section data-tour={mode === 'interview' ? 'interview-practice' : 'scenario-practice'} className="panel practice"><p className="eyebrow">{job.company} · {job.title}</p><div className="section-heading"><h1>{mode === 'interview' ? '模拟面试' : '体验岗位一天'}</h1><button className="text-button" disabled={busy || !loaded} onClick={() => { if (window.confirm('重新开始这次练习？当前回答和复盘将被替换。')) void run(async () => { if (savedVersion !== version || !exercise) { const next = await prepareExercise(); await persist({ ...startState(), exercise: next }, version); } else await persist({ ...startState(), exercise }); }); }}>重新开始</button></div>
    {busy && <AsyncStatus label={busyLabel} />}
    {savedVersion && savedVersion !== version && <div className="notice">岗位或公司资料已更新，这份记录来自更新前的练习，可重新开始。</div>}
    <div className="practice-flow" aria-label="本轮进度">{(mode === 'interview' ? ['回答岗位问题', '完成一次追问', '回看本轮复盘'] : ['处理第一项任务', '处理第二项任务', '回看工作复盘']).map((text, index) => { const active = state.feedback ? 2 : mode === 'interview' ? state.followup ? 1 : 0 : state.node; return <span key={text} className={index === active ? 'current' : index < active ? 'done' : ''}><b>{index < active ? <Icon name="check" size={12} /> : index + 1}</b>{text}</span>; })}</div>
    <div className="practice-settings"><button className="text-button" disabled={busy || !loaded} onClick={() => { if ((!state.answer && !state.moves.length) || window.confirm('按当前JD重新生成题目与任务，会替换本次练习，继续吗？')) void customize(); }}>{busy ? '正在准备…' : '按当前JD调整题目与任务'}</button></div><div className="task-brief"><h2>{mode === 'scenario' ? '任务简报' : '问题背景'}</h2><p>{exercise.background}</p></div><div className="tag-row">{exercise.dimensions.map((dimension) => <span className="tag" key={dimension}>{dimension}</span>)}</div>
    <details className="practice-sources"><summary>岗位依据与公司资料</summary>{[...(job.requirements || []), ...(job.responsibilities || [])].map((item) => <blockquote key={item.id}>{item.sourceText || item.text}</blockquote>)}{jobSources.map((source) => <p key={source.id}>{source.label}：{source.text}</p>)}</details>
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
    {!state.feedback && mode === 'interview' && <div className="page-stack"><div className="question-card"><h2>本轮题目</h2><p>{exercise.question}</p></div><label>我的回答<VoiceTextarea rows={9} maxLength={20000} value={state.answer} disabled={!!state.followup || busy} onChange={(event) => setState({ ...state, answer: event.target.value })} onBlur={saveDraft} /></label>{!state.followup ? <button className="primary" disabled={busy || !loaded || !state.answer.trim()} onClick={() => interview('followup')}>{busy ? '正在阅读回答…' : '提交回答，获得追问'}</button> : <><div className="dialogue"><strong>面试官追问</strong><p>{state.followup}</p></div><label>补充回答<VoiceTextarea rows={7} maxLength={20000} value={state.supplement} onChange={(event) => setState({ ...state, supplement: event.target.value })} onBlur={saveDraft} /></label><button className="primary" disabled={busy || !state.supplement.trim()} onClick={() => interview('review')}>{busy ? '正在整理复盘…' : '提交补充，查看复盘'}</button></>}</div>}
    {!state.feedback && mode === 'scenario' && current && <div className="page-stack work-task"><div className="task-title"><span>任务 {String(state.node + 1).padStart(2, '0')} / 02</span><h2>{current.title}</h2></div><ColleagueMessage colleague={current.colleague} text={current.situation} />{current.change && <p className="task-deliverable">{current.change}</p>}
      {state.moves.filter((move) => move.node === state.node).map((move, index) => <div className="work-exchange" key={index}><div className="my-action"><span>我的推进方式</span><p>{move.action}</p></div><ColleagueMessage colleague={current.colleague} text={move.dialogue} reply />{move.consequence && <div className="work-impact"><span><Icon name="arrow" size={15} />对工作推进的影响</span><p>{move.consequence}</p></div>}</div>)}
      {!state.response?.consequence && <><details className="ask-colleague"><summary>信息还不够？向{current.colleague}提问</summary><label>向{current.colleague}提问<VoiceTextarea rows={2} value={state.question} maxLength={2000} onChange={(event) => setState({ ...state, question: event.target.value })} onBlur={saveDraft} placeholder="例如：已有的数据口径和用户反馈是什么？" /></label><button className="secondary" disabled={busy || !state.question.trim()} onClick={() => scenario('dialogue')}>发送问题 <Icon name="arrow" size={15} /></button></details><fieldset className="work-choices"><legend>你准备怎么推进？</legend>{current.choices.map((choice, index) => <label key={choice} className="selection-card"><input type="radio" name="choice" checked={state.choice === choice} onChange={() => setState({ ...state, choice })} /><span className="choice-letter">{String.fromCharCode(65 + index)}</span><span>{choice}</span></label>)}</fieldset><details className="custom-action"><summary>写下自己的推进方式</summary><label>也可写下自己的做法<VoiceTextarea rows={3} value={current.choices.includes(state.choice) ? '' : state.choice} onChange={(event) => setState({ ...state, choice: event.target.value })} onBlur={saveDraft} /></label></details><div className="actions end-actions"><button className="primary" disabled={busy || !state.choice.trim()} onClick={() => scenario('decision')}>{busy ? '同事正在回应…' : '提交行动'}<Icon name="arrow" size={16} /></button></div></>}
      {state.response?.consequence && <div className="actions end-actions"><button className="primary" disabled={busy} onClick={() => state.node === 0 ? persist({ ...state, node: 1, choice: '', question: '', response: null }) : scenario('review')}>{busy ? '正在整理复盘…' : state.node === 0 ? '继续下一项任务' : '查看任务复盘'}<Icon name="arrow" size={16} /></button></div>}
    </div>}
    {state.feedback && <PracticeReview key={sessionId} feedback={state.feedback} job={job} mode={mode} onCopy={() => void run(async () => { await copyText(state.feedback!.outline.join('\n')); setMessage('已复制提纲。'); })} onAdd={text => addTask(text, [job.id])} onNext={text => void run(async () => { if (example) onNextAction?.(text); else { await database.jobs.update(job.id, { nextAction: text, updatedAt: new Date().toISOString() }); await refresh(); } setMessage('已设为这个岗位的下一步行动。'); })} />}
    <p className="privacy-note">提交的回答或行动会用于本次追问与复盘，并保存在当前账号。</p>
  </section>);
}

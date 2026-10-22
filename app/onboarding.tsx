'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export const tutorialSteps = [
  { id: 'add', target: 'add-jd', title: '先添加一个感兴趣的岗位', text: '从招聘链接、JD截图或正文开始。跟着实际岗位走一遍，了解如何把岗位要求变成准备行动。', next: '添加我的岗位' },
  { id: 'input', target: 'jd-input', title: '选一种方式提供JD', text: '粘贴招聘链接，或切换到截图、正文。点击解析后会提取职责和要求；链接读不到时，可以保留链接换一种方式。', next: '开始填写', waiting: '填写岗位后点击解析；已有正文也可手动整理为草稿。' },
  { id: 'review', target: 'jd-review', title: '对照原文，核对岗位内容', text: '检查公司、名称、职责和要求。岗位类型会按JD自动判断，无需单独确认分类；核对内容后点击“保存岗位”。', next: '开始核对', waiting: '核对岗位内容，点击“保存岗位”后继续拆解。' },
  { id: 'requirements', target: 'jd-breakdown', title: '看清工作内容与准备重点', text: '左侧是岗位要解决的问题，右侧是优先关注的要求。展开完整JD可以回看原文，先找出最需要用经历回应的部分。', next: '看看岗位如何归类' },
  { id: 'category', target: 'job-category', title: '相似职责，会归到同一类', text: '归类依据职责、方法和交付物，相近的“交互设计”和“体验设计”可以放在一起。这里可查看JD依据，也可手动修改类型。', next: '了解公司业务' },
  { id: 'company', target: 'company-research', title: '把岗位放回公司的业务里', text: '这里搜索公司公开资料，整理业务、岗位关联和面试中值得问的问题。展开依据可查看来源，搜索未完成时也能继续准备。', next: '整理我的经历' },
  { id: 'projects', target: 'project-import', title: '把真实经历整理成项目', text: '上传简历、读取作品集，或手动新增项目。核对本人角色、阶段和事实后勾选确认，项目就能用于岗位匹配。', next: '开始整理项目', waiting: '整理并确认一个项目后继续；也可以先了解后面的准备流程。' },
  { id: 'match', target: 'project-builder', title: '选出这个岗位最值得讲的经历', text: '从已确认的项目中推荐最多三个，调整主讲和辅助顺序，生成简历要点与面试提纲。逐条核对并采用后，就能复制使用。', next: '查看面试准备' },
  { id: 'preparation', target: 'preparation-card', title: '把要求变成具体准备事项', text: '生成准备卡，看看岗位看重什么、你能讲什么、还需补什么，以及面试前要了解什么。每条建议可展开依据并加入计划。', next: '了解两种练习方式' },
  { id: 'practice', target: 'practice-launch', title: '用回答和行动检验准备', text: '模拟面试会追问并复盘；岗位体验让你处理两项实际工作任务。复盘里的建议可以加入计划，也可以设为岗位的下一步行动。', next: '安排我的下一步' },
  { id: 'plan', target: 'weekly-plan', title: '从这里持续推进准备', text: '加入计划的建议会汇总在这里。勾选完成、调整顺序，把复盘得到的新行动接着做下去。以后可随时从首页重新打开教程。', next: '开始准备' },
] as const;
export type TutorialStep = typeof tutorialSteps[number]['id'];

const welcomeRequests = new Map<string, Promise<{ show: boolean }>>();
async function updateTutorial(accountId: string, action: string) {
  const response = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Account-Id': accountId }, body: JSON.stringify({ action }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Tutorial state unavailable');
  return response.json() as Promise<{ show: boolean }>;
}

export function useOnboarding(accountId: string, ready: boolean, onStart: () => void) {
  const [step, setStep] = useState<TutorialStep | null>(null);
  const [paused, setPaused] = useState(false);
  const handled = useRef(false);
  const startCallback = useRef(onStart); startCallback.current = onStart;
  const begin = useCallback(() => { handled.current = true; setPaused(false); setStep('add'); startCallback.current(); }, []);
  useEffect(() => {
    if (!ready || handled.current) return;
    let disposed = false;
    // Reuse the request during React's effect replay; the server atomically claims the first welcome.
    if (!welcomeRequests.has(accountId)) welcomeRequests.set(accountId, updateTutorial(accountId, 'claim').catch(error => { welcomeRequests.delete(accountId); throw error; }));
    void welcomeRequests.get(accountId)!.then(result => { if (!disposed && !handled.current) { handled.current = true; if (result.show) begin(); } }).catch(() => {});
    return () => { disposed = true; };
  }, [accountId, ready, begin]);
  const go = useCallback((next: TutorialStep) => { setPaused(false); setStep(next); }, []);
  const start = () => { begin(); void updateTutorial(accountId, 'start').catch(() => {}); };
  const close = (action: 'skip' | 'complete') => { handled.current = true; setStep(null); setPaused(false); void updateTutorial(accountId, action).catch(() => {}); };
  return { step, paused, start, go, pause: () => setPaused(true), resume: () => setPaused(false), skip: () => close('skip'), complete: () => close('complete') };
}

type Bounds = { left: number; top: number; width: number; height: number; viewWidth: number; viewHeight: number };
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]';

export default function Onboarding({ step, paused, onNext, onPreviewNext, onBack, onPause, onResume, onSkip, onRecover, onExisting }: {
  step: TutorialStep; paused: boolean; onNext: () => void; onPreviewNext: () => void; onBack?: () => void; onPause: () => void; onResume: () => void; onSkip: () => void; onRecover: () => void; onExisting?: () => void;
}) {
  const index = tutorialSteps.findIndex(item => item.id === step);
  const current = tutorialSteps[index];
  const waiting = 'waiting' in current ? current.waiting : '';
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [cardSize, setCardSize] = useState({ width: 350, height: 290 });
  const card = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onPause, onSkip }); callbacks.current = { onPause, onSkip };

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); callbacks.current.onSkip(); } };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, []);

  useEffect(() => {
    if (paused) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    card.current?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [paused]);

  useEffect(() => {
    if (paused) return;
    let frame = 0; let target: HTMLElement | null = null; let scrolled = false;
    const selector = `[data-tour="${current.target}"]`;
    const measure = () => {
      const element = [...document.querySelectorAll<HTMLElement>(selector)].find(item => item.getClientRects().length > 0) || null;
      if (element !== target) { if (target) observer.unobserve(target); target = element; if (target) observer.observe(target); }
      if (!target) { setBounds(null); return; }
      let rect = target.getBoundingClientRect();
      if (!scrolled) {
        scrolled = true;
        if (!target.closest('.topbar') && (rect.top < 92 || rect.bottom > innerHeight - 40)) {
          window.scrollTo({ top: Math.max(0, scrollY + rect.top - 105), behavior: 'instant' });
          rect = target.getBoundingClientRect();
        }
      }
      const left = Math.max(5, rect.left - 7); const top = Math.max(5, rect.top - 7);
      const right = Math.min(innerWidth - 5, rect.right + 7); const bottom = Math.min(innerHeight - 5, rect.bottom + 7);
      const next = { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top), viewWidth: innerWidth, viewHeight: innerHeight };
      setBounds(before => JSON.stringify(before) === JSON.stringify(next) ? before : next);
      if (card.current) { const box = card.current.getBoundingClientRect(); setCardSize(before => before.width === box.width && before.height === box.height ? before : { width: box.width, height: box.height }); }
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);
    if (card.current) observer.observe(card.current);
    mutation.observe(document.getElementById('workspace-main') || document.body, { childList: true, subtree: true });
    const interact = (event: Event) => {
      const element = event.target instanceof Element ? event.target : null;
      // Wait until the actual click completes. Moving the form on focus would cancel touch clicks.
      if (waiting && target?.contains(element) && element?.closest('button,input,textarea,select,summary,label')) queueMicrotask(() => callbacks.current.onPause());
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [...(target?.querySelectorAll<HTMLElement>(focusable) || []), ...(target?.matches(focusable) ? [target] : []), ...(card.current?.querySelectorAll<HTMLElement>(focusable) || [])].filter(item => item.getClientRects().length && item.tabIndex >= 0);
      if (!controls.length) return;
      const position = controls.indexOf(document.activeElement as HTMLElement);
      const next = controls[position < 0 ? event.shiftKey ? controls.length - 1 : 0 : (position + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
      event.preventDefault(); next.focus();
    };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    document.addEventListener('keydown', keyDown, true); document.addEventListener('click', interact, true);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('keydown', keyDown, true); document.removeEventListener('click', interact, true); };
  }, [step, paused, current.target, waiting]);

  if (paused) return <aside className="tutorial-waiting" aria-label="新手教程进度"><div><strong>第{index + 1}步 · {current.title}</strong><p>{waiting || '可以先操作当前页面，准备好后继续教程。'}</p></div><div className="tutorial-waiting-actions"><button className="secondary small" onClick={onResume}>查看引导</button>{step !== 'input' && step !== 'review' && <button className="primary small" onClick={onNext}>{step === 'projects' ? '先看后续步骤' : '继续教程'}</button>}<button className="text-button" onClick={onSkip}>跳过教程</button></div></aside>;

  const viewportWidth = bounds?.viewWidth || (typeof window !== 'undefined' ? innerWidth : 390);
  const viewportHeight = bounds?.viewHeight || (typeof window !== 'undefined' ? innerHeight : 800);
  const width = Math.min(350, viewportWidth - 24); const height = cardSize.height;
  let left = Math.max(12, (viewportWidth - width) / 2); let top = Math.max(80, (viewportHeight - height) / 2);
  if (bounds) {
    const right = bounds.left + bounds.width; const bottom = bounds.top + bounds.height;
    if (viewportWidth - right >= width + 28) { left = right + 16; top = bounds.top; }
    else if (bounds.left >= width + 28) { left = bounds.left - width - 16; top = bounds.top; }
    else if (viewportHeight - bottom >= height + 28) { left = bounds.left; top = bottom + 16; }
    else if (bounds.top - 80 >= height + 20) { left = bounds.left; top = bounds.top - height - 16; }
    else { left = bounds.left; top = viewportHeight - height - (viewportWidth < 768 ? 88 : 18); }
  }
  left = Math.max(12, Math.min(left, viewportWidth - width - 12));
  top = Math.max(12, Math.min(top, viewportHeight - height - 12));
  return createPortal(<div className="tutorial-layer" data-step={step}>
    {bounds && bounds.width > 0 && bounds.height > 0 ? <>
      <div className="tutorial-spotlight" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} />
      <div className="tutorial-blocker" style={{ top: 0, left: 0, right: 0, height: bounds.top }} />
      <div className="tutorial-blocker" style={{ top: bounds.top + bounds.height, left: 0, right: 0, bottom: 0 }} />
      <div className="tutorial-blocker" style={{ top: bounds.top, left: 0, width: bounds.left, height: bounds.height }} />
      <div className="tutorial-blocker" style={{ top: bounds.top, left: bounds.left + bounds.width, right: 0, height: bounds.height }} />
    </> : <div className="tutorial-blocker tutorial-full-shade" />}
    <div ref={card} className="tutorial-card" role="dialog" aria-label="新手教程" aria-labelledby="tutorial-title" aria-describedby="tutorial-description" tabIndex={-1} style={{ left, top, width }}>
      <div className="tutorial-card-top"><span><Icon name="sparkles" size={16} />新手教程 <b>{index + 1} / {tutorialSteps.length}</b></span><button className="tutorial-close" aria-label="关闭新手教程" onClick={onSkip}>×</button></div>
      <div className="tutorial-progress" aria-hidden="true">{tutorialSteps.map((item, itemIndex) => <i key={item.id} className={itemIndex <= index ? 'done' : ''} />)}</div>
      <h2 id="tutorial-title">{current.title}</h2><p id="tutorial-description">{current.text}</p>
      {!bounds && <p className="tutorial-target-missing">当前页面已切换，可以返回这一步继续。</p>}
      <div className="tutorial-card-actions">{onBack && <button className="secondary" onClick={onBack}>上一步</button>}<button className="primary" onClick={bounds ? onNext : onRecover}>{bounds ? current.next : '返回这一步'}<Icon name="arrow" size={15} /></button></div>
      <div className="tutorial-card-footer"><button className="tutorial-skip" onClick={onSkip}>跳过教程</button>{step === 'add' && onExisting && <button className="tutorial-skip" onClick={onExisting}>用已有岗位继续</button>}{step === 'projects' && <button className="tutorial-skip" onClick={onPreviewNext}>先了解后续流程</button>}{!waiting && step !== 'add' && step !== 'plan' && <button className="tutorial-skip" onClick={onPause}>先试着操作</button>}</div>
    </div>
  </div>, document.body);
}

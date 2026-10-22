'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export const tutorialSteps = [
  { id: 'add', target: 'add-jd', title: '从添加岗位开始', text: '点击“新增JD”添加感兴趣的岗位。先用一个示例熟悉操作，无需填写资料。', next: '开始教程' },
  { id: 'input', target: 'jd-input', title: '导入岗位信息', text: '支持招聘链接、JD截图和正文三种方式。本例已填好链接，点击“下一步”查看解析结果。', next: '下一步' },
  { id: 'review', target: 'jd-review', title: '核对岗位信息', text: '解析后可对照原文，检查岗位名称、公司、职责和要求。确认无误后，保存到岗位清单。', next: '下一步' },
  { id: 'requirements', target: 'jd-breakdown', title: '查看岗位要求', text: '职责和任职要求已分开整理。准备简历和面试时，可回到这里查看重点，也可展开完整JD。', next: '下一步' },
  { id: 'category', target: 'job-category', title: '自动归类岗位', text: '岗位按JD内容自动分类。“交互设计”“体验设计”等相近名称可以归为一类，也可在岗位详情中手动修改。', next: '下一步' },
  { id: 'company', target: 'company-research', title: '了解公司业务', text: '自动搜索公司公开资料，整理主要业务及岗位相关信息。展开“查看依据”可查看来源。', next: '下一步' },
  { id: 'projects', target: 'project-import', title: '整理项目经历', text: '上传简历、添加作品集链接，或手动新增项目。核对本人角色、做过的工作和结果后，可用于岗位匹配。', next: '下一步' },
  { id: 'match', target: 'project-builder', title: '选择匹配的项目', text: '根据JD推荐相关项目，并整理简历要点和面试提纲。核对内容后，勾选采用即可复制。', next: '下一步' },
  { id: 'preparation', target: 'preparation-card', title: '查看准备建议', text: '准备卡列出岗位重点、可用经历和待补内容。点击“加入我的计划”，记下要做的事。', next: '下一步' },
  { id: 'practice', target: 'practice-launch', title: '试试面试和岗位体验', text: '模拟面试可练习回答和追问，岗位体验可尝试处理工作任务。练习结束后，查看复盘和改进建议。', next: '下一步' },
  { id: 'plan', target: 'weekly-plan', title: '管理准备计划', text: '加入计划的事项会显示在“本周准备”，完成后勾选即可。教程已结束，可以添加自己的JD开始准备。', next: '添加我的JD' },
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
  const [run, setRun] = useState(0);
  const handled = useRef(false);
  const startCallback = useRef(onStart); startCallback.current = onStart;
  const begin = useCallback(() => { handled.current = true; setPaused(false); setRun(current => current + 1); setStep('add'); startCallback.current(); }, []);
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
  return { step, paused, run, start, go, pause: () => setPaused(true), resume: () => setPaused(false), skip: () => close('skip'), complete: () => close('complete') };
}

type Bounds = { left: number; top: number; width: number; height: number; viewWidth: number; viewHeight: number };
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]';

export default function Onboarding({ step, paused, onNext, onBack, onPause, onResume, onSkip, onRecover, onOwnJob, onReturnHome }: {
  step: TutorialStep; paused: boolean; onNext: () => void; onBack?: () => void; onPause: () => void; onResume: () => void; onSkip: () => void; onRecover: () => void; onOwnJob: () => void; onReturnHome: () => void;
}) {
  const index = tutorialSteps.findIndex(item => item.id === step);
  const current = tutorialSteps[index];
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [cardSize, setCardSize] = useState({ width: 350, height: 290 });
  const card = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSkip }); callbacks.current = { onSkip };

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
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [...(target?.querySelectorAll<HTMLElement>(focusable) || []), ...(target?.matches(focusable) ? [target] : []), ...(card.current?.querySelectorAll<HTMLElement>(focusable) || [])].filter(item => item.getClientRects().length && item.tabIndex >= 0);
      if (!controls.length) return;
      const position = controls.indexOf(document.activeElement as HTMLElement);
      const next = controls[position < 0 ? event.shiftKey ? controls.length - 1 : 0 : (position + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
      event.preventDefault(); next.focus();
    };
    window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    document.addEventListener('keydown', keyDown, true);
    measure();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect(); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('keydown', keyDown, true); };
  }, [step, paused, current.target]);

  if (paused) return <aside className="tutorial-waiting" aria-label="新手教程进度"><div><strong>第{index + 1}步 · {current.title}</strong><p>可查看示例内容，或继续下一步。</p></div><div className="tutorial-waiting-actions"><button className="secondary small" onClick={onResume}>继续引导</button><button className="primary small" onClick={onNext}>{current.next}</button><button className="text-button" onClick={onSkip}>退出教程</button></div></aside>;

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
      {!bounds && <p className="tutorial-target-missing">请返回当前步骤后继续。</p>}
      <div className="tutorial-card-actions">{onBack && <button className="secondary" onClick={onBack}>上一步</button>}<button className="primary" onClick={bounds ? onNext : onRecover}>{bounds ? current.next : '返回这一步'}<Icon name="arrow" size={15} /></button></div>
      <div className="tutorial-card-footer"><button className="tutorial-skip" onClick={step === 'plan' ? onReturnHome : onSkip}>{step === 'plan' ? '返回首页' : '跳过教程'}</button><button className="tutorial-skip" onClick={onOwnJob}>使用自己的JD</button>{step !== 'add' && <button className="tutorial-skip" onClick={onPause}>收起引导</button>}</div>
    </div>
  </div>, document.body);
}

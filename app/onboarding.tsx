'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export const tutorialSteps = [
  { id: 'add', target: 'add-jd', title: '先用案例看懂准备流程', text: '教程已备好一条JD和后续结果，可以一路点“下一步”，无需先填写资料。跟随虚构的星桥协作岗位，看看如何从读懂JD走到具体准备。', next: '开始浏览' },
  { id: 'input', target: 'jd-input', title: '选一种方式提供JD', text: '真实使用时，招聘链接、截图和正文任选一种。这里已准备好输入案例，直接点“下一步”查看解析结果，也可以切换输入方式看看。', next: '下一步' },
  { id: 'review', target: 'jd-review', title: '看看解析后会得到什么', text: '公司、名称、职责和要求会拆成可核对的字段。案例内容已准备好，直接继续即可；使用自己的JD时，再核对并保存。', next: '下一步' },
  { id: 'requirements', target: 'jd-breakdown', title: '看清工作内容与准备重点', text: '左侧是岗位要解决的问题，右侧是优先关注的要求。展开完整JD可以回看原文，先找出最需要用经历回应的部分。', next: '下一步' },
  { id: 'category', target: 'job-category', title: '相似职责，会归到同一类', text: '归类依据职责、方法和交付物，相近的“交互设计”和“体验设计”可以放在一起。这里可查看JD依据，也可手动修改类型。', next: '下一步' },
  { id: 'company', target: 'company-research', title: '把岗位放回公司的业务里', text: '这里搜索公司公开资料，整理业务、岗位关联和面试中值得问的问题。展开依据可查看来源，搜索未完成时也能继续准备。', next: '下一步' },
  { id: 'projects', target: 'project-import', title: '把真实经历整理成项目', text: '这里用一个已核对的课程项目展示整理结果。真实使用时，可以上传简历、读取作品集或手动新增，确认角色、阶段和事实后用于匹配。', next: '下一步' },
  { id: 'match', target: 'project-builder', title: '选出这个岗位最值得讲的经历', text: '从已确认的项目中推荐最多三个，调整主讲和辅助顺序，生成简历要点与面试提纲。逐条核对并采用后，就能复制使用。', next: '下一步' },
  { id: 'preparation', target: 'preparation-card', title: '把要求变成具体准备事项', text: '生成准备卡，看看岗位看重什么、你能讲什么、还需补什么，以及面试前要了解什么。每条建议可展开依据并加入计划。', next: '下一步' },
  { id: 'practice', target: 'practice-launch', title: '用回答和行动检验准备', text: '模拟面试会追问并复盘；岗位体验让你处理两项实际工作任务。复盘里的建议可以加入计划，也可以设为岗位的下一步行动。', next: '下一步' },
  { id: 'plan', target: 'weekly-plan', title: '从这里持续推进准备', text: '准备事项与复盘建议汇总到计划，完成一项再推进下一项。案例只用于本次浏览；现在可以添加自己的JD，或返回首页。', next: '添加自己的JD' },
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

  if (paused) return <aside className="tutorial-waiting" aria-label="新手教程进度"><div><strong>第{index + 1}步 · {current.title}</strong><p>自由查看案例，随时可以继续下一步。</p></div><div className="tutorial-waiting-actions"><button className="secondary small" onClick={onResume}>查看引导</button><button className="primary small" onClick={onNext}>{current.next}</button><button className="text-button" onClick={onSkip}>退出教程</button></div></aside>;

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
      <div className="tutorial-card-footer"><button className="tutorial-skip" onClick={step === 'plan' ? onReturnHome : onSkip}>{step === 'plan' ? '返回首页' : '跳过教程'}</button><button className="tutorial-skip" onClick={onOwnJob}>用自己的JD试一试</button>{step !== 'add' && <button className="tutorial-skip" onClick={onPause}>自由查看案例</button>}</div>
    </div>
  </div>, document.body);
}

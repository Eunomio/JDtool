'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export const tutorialSteps = [
  { id: 'add', target: 'add-jd', title: '从添加岗位开始', text: '点击“新增JD”添加感兴趣的岗位。先用一个示例熟悉操作，无需填写资料。', next: '开始教程' },
  { id: 'input', target: 'jd-input', focus: 'form', title: '导入岗位信息', text: '支持招聘链接、JD截图和正文三种方式。本例已填好链接，点击“下一步”查看解析结果。', next: '下一步' },
  { id: 'review', target: 'jd-review', focus: '.review-fields', title: '核对岗位信息', text: '解析后可对照原文，检查岗位名称、公司、职责和要求。确认无误后，保存到岗位清单。', next: '下一步' },
  { id: 'requirements', target: 'jd-breakdown', title: '查看岗位要求', text: '职责和任职要求已分开整理。准备简历和面试时，可回到这里查看重点，也可展开完整JD。', next: '下一步' },
  { id: 'category', target: 'job-category', title: '自动归类岗位', text: '岗位按JD内容自动分类。“交互设计”“体验设计”等相近名称可以归为一类，也可在岗位详情中手动修改。', next: '下一步' },
  { id: 'company', target: 'company-research', title: '了解公司业务', text: '自动搜索公司公开资料，整理主要业务及岗位相关信息。展开“查看依据”可查看来源。', next: '下一步' },
  { id: 'projects', target: 'project-import', title: '整理项目经历', text: '上传简历、添加作品集链接，或手动新增项目。核对本人角色、做过的工作和结果后，可用于岗位匹配。', next: '下一步' },
  { id: 'match', target: 'project-builder', focus: '.builder-columns', title: '选择匹配的项目', text: '根据JD推荐相关项目，并整理简历要点和面试提纲。核对内容后，勾选采用即可复制。', next: '下一步' },
  { id: 'preparation', target: 'preparation-card', focus: '.preparation-grid', title: '查看准备建议', text: '准备卡列出岗位重点、可用经历和待补内容。点击“加入我的计划”，记下要做的事。', next: '下一步' },
  { id: 'practice', target: 'practice-launch', title: '选择练习方式', text: '点击“模拟面试”练习回答，或点击“体验岗位一天”尝试处理工作任务。', next: '下一步' },
  { id: 'interview', target: 'interview-practice', focus: '.page-stack', title: '试试模拟面试', text: '提交回答后会收到一次追问，补充回答后可查看复盘。示例已填好，也可直接点击“下一步”。', next: '下一步' },
  { id: 'scenario', target: 'scenario-practice', focus: '.work-task, .page-stack', title: '体验岗位工作', text: '向同事了解情况，选择或填写处理方案，再查看工作反馈。完成两项任务后可查看复盘。', next: '下一步' },
  { id: 'plan', target: 'weekly-plan', title: '管理准备计划', text: '加入计划的事项会显示在“本周准备”，完成后勾选即可。点击“完成教程”返回首页。', next: '完成教程' },
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

type Bounds = { left: number; top: number; width: number; height: number };
type Layout = {
  mode: 'floating' | 'docked'; compact: boolean; left: number; top: number; width: number; maxHeight: number;
  bounds: Bounds | null; interaction: Bounds | null; found: boolean;
};
const focusable = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]';
const frameProperties = ['--tutorial-shell-height', '--tutorial-panel-limit'] as const;

export default function Onboarding({ step, paused, onNext, onBack, onPause, onResume, onSkip, onRecover }: {
  step: TutorialStep; paused: boolean; onNext: () => void; onBack?: () => void; onPause: () => void; onResume: () => void; onSkip: () => void; onRecover: () => void;
}) {
  const index = tutorialSteps.findIndex(item => item.id === step);
  const current = tutorialSteps[index];
  const [layout, setLayout] = useState<Layout | null>(null);
  const [expanded, setExpanded] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const revealedStep = useRef('');
  const callbacks = useRef({ onSkip }); callbacks.current = { onSkip };
  const docked = layout?.mode === 'docked';
  const detailsVisible = !docked || !layout?.compact || expanded;

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); callbacks.current.onSkip(); } };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, []);
  useLayoutEffect(() => { setExpanded(false); }, [step]);

  // The product keeps its normal width. Only its scrollable viewport gives space to the guide.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = { active: root.dataset.tutorialActive, short: root.dataset.tutorialShort, styles: frameProperties.map(name => [name, root.style.getPropertyValue(name)] as const) };
    root.dataset.tutorialActive = 'true';
    window.scrollTo({ top: 0 });
    return () => {
      if (previous.active === undefined) delete root.dataset.tutorialActive; else root.dataset.tutorialActive = previous.active;
      if (previous.short === undefined) delete root.dataset.tutorialShort; else root.dataset.tutorialShort = previous.short;
      for (const [name, value] of previous.styles) { if (value) root.style.setProperty(name, value); else root.style.removeProperty(name); }
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    card.current?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [paused]);

  useLayoutEffect(() => {
    const main = document.getElementById('workspace-main');
    if (!main || !card.current) return;
    let frame = 0; let target: HTMLElement | null = null; let revealFocused = true;
    const root = document.documentElement;
    const selector = `[data-tour="${current.target}"]`;
    const focusSelector = 'focus' in current ? current.focus : '';
    const remember = (next: Layout) => setLayout(before => JSON.stringify(before) === JSON.stringify(next) ? before : next);
    const measure = () => {
      const viewport = window.visualViewport;
      const viewTop = viewport?.offsetTop || 0; const viewLeft = viewport?.offsetLeft || 0;
      const viewWidth = viewport?.width || innerWidth; const viewHeight = viewport?.height || innerHeight;
      const viewBottom = viewTop + viewHeight; const viewRight = viewLeft + viewWidth;
      root.dataset.tutorialShort = String(viewHeight < 460 || innerHeight - viewHeight > 100);
      const headerBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
      const navigation = document.querySelector('.mobile-navigation');
      const navigationHeight = navigation?.getClientRects().length ? navigation.getBoundingClientRect().height : 0;
      const contentBottom = viewBottom - navigationHeight;
      const compact = viewWidth < 768 || viewHeight < 560;
      const panelLimit = Math.max(116, Math.min(300, Math.floor(viewHeight * .42)));
      root.style.setProperty('--tutorial-panel-limit', `${panelLimit}px`);
      const element = [...document.querySelectorAll<HTMLElement>(selector)].find(item => item.getClientRects().length > 0) || null;
      if (element !== target) { if (target) observer.unobserve(target); target = element; if (target) observer.observe(target); }
      const mainLeft = Math.max(viewLeft, main.getBoundingClientRect().left);
      const area = target?.getBoundingClientRect();
      const floatingWidth = 350; const gap = 16;
      const canRight = !!area && viewRight - area.right - 12 >= floatingWidth + gap;
      const canLeft = !!area && area.left - mainLeft - 12 >= floatingWidth + gap;
      const mode = !paused && !compact && (canRight || canLeft) ? 'floating' : 'docked';
      const width = mode === 'docked' ? Math.max(0, viewRight - mainLeft) : floatingWidth;
      const left = mode === 'docked' ? mainLeft : canRight ? area!.right + gap : area!.left - floatingWidth - gap;
      const maxHeight = mode === 'docked' ? panelLimit : Math.max(116, contentBottom - Math.max(viewTop, headerBottom) - 24);
      // Re-render at the new width before measuring height, so text wrapping cannot hide content.
      if (card.current?.dataset.layout !== mode || Math.abs(card.current.getBoundingClientRect().width - width) > 1) {
        remember({ mode, compact, left, top: Math.max(viewTop, headerBottom) + 12, width, maxHeight, bounds: null, interaction: null, found: !!target });
        return;
      }
      const cardHeight = card.current.getBoundingClientRect().height;
      const panelHeight = mode === 'docked' ? cardHeight : 0;
      const frameBottom = contentBottom - panelHeight;
      root.style.setProperty('--tutorial-shell-height', `${Math.max(40, frameBottom - headerBottom)}px`);
      const visibleTop = Math.max(viewTop, headerBottom);
      const mainBounds = main.getBoundingClientRect();
      const focusTarget = target && focusSelector ? target.querySelector<HTMLElement>(focusSelector) || target : target;
      if (target && revealedStep.current !== step) {
        if (main.contains(target)) main.scrollTop += focusTarget!.getBoundingClientRect().top - visibleTop - 16;
        else main.scrollTop = 0;
        revealedStep.current = step;
      }
      if (revealFocused) {
        revealFocused = false;
        const active = document.activeElement;
        if (active instanceof HTMLElement && main.contains(active) && active.matches('input,textarea,select')) {
          const rect = active.getBoundingClientRect();
          const space = frameBottom - visibleTop - 24;
          if (rect.height > space || rect.top < visibleTop + 12) main.scrollTop += rect.top - visibleTop - 12;
          else if (rect.bottom > frameBottom - 12) main.scrollTop += rect.bottom - frameBottom + 12;
        } else if (focusTarget && main.contains(focusTarget)) {
          const rect = focusTarget.getBoundingClientRect();
          // Wrapping and orientation changes can move the current section out of view.
          if (rect.top >= frameBottom - 12 || rect.bottom <= visibleTop + 12) main.scrollTop += rect.top - visibleTop - 16;
        }
      }
      const clip = (node: HTMLElement | null): Bounds | null => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const inMain = main.contains(node);
        const clipTop = inMain ? Math.max(visibleTop, mainBounds.top) : viewTop + 4;
        const clipBottom = inMain ? Math.min(frameBottom, mainBounds.bottom) : contentBottom;
        const x = Math.max(viewLeft + 5, rect.left - 7); const y = Math.max(clipTop + 5, rect.top - 7);
        const right = Math.min(viewRight - 5, rect.right + 7); const bottom = Math.min(clipBottom - 5, rect.bottom + 7);
        return right > x && bottom > y ? { left: x, top: y, width: right - x, height: bottom - y } : null;
      };
      const bounds = clip(focusTarget);
      const interaction = clip(target);
      const top = mode === 'docked' ? frameBottom : Math.max(visibleTop + 12, Math.min(area?.top || visibleTop + 12, contentBottom - cardHeight - 12));
      remember({ mode, compact, left, top, width, maxHeight, bounds, interaction, found: !!target });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = () => { revealFocused = true; schedule(); };
    const observer = new ResizeObserver(resize);
    observer.observe(card.current); observer.observe(main);
    const header = document.querySelector('.topbar'); if (header) observer.observe(header);
    const mutation = new MutationObserver(schedule);
    mutation.observe(main, { childList: true, subtree: true });
    const keyDown = (event: KeyboardEvent) => {
      if (paused || event.key !== 'Tab') return;
      const controls = [...(target?.querySelectorAll<HTMLElement>(focusable) || []), ...(target?.matches(focusable) ? [target] : []), ...(card.current?.querySelectorAll<HTMLElement>(focusable) || [])].filter(item => item.getClientRects().length && item.tabIndex >= 0);
      if (!controls.length) return;
      const position = controls.indexOf(document.activeElement as HTMLElement);
      const next = controls[position < 0 ? event.shiftKey ? controls.length - 1 : 0 : (position + (event.shiftKey ? -1 : 1) + controls.length) % controls.length];
      event.preventDefault(); next.focus();
    };
    main.addEventListener('scroll', schedule, { passive: true });
    main.addEventListener('focusin', resize);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    document.addEventListener('keydown', keyDown, true);
    measure();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect();
      main.removeEventListener('scroll', schedule); main.removeEventListener('focusin', resize);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize);
      document.removeEventListener('keydown', keyDown, true);
    };
  }, [step, paused, expanded, layout?.mode, current]);

  const bounds = !paused ? layout?.bounds : null;
  const interaction = !paused ? layout?.interaction : null;
  const heading = <h2 id="tutorial-title">{current.title}</h2>;
  return createPortal(<div className="tutorial-layer" data-step={step} data-layout={layout?.mode || 'floating'} data-paused={paused}>
    {bounds && <div className="tutorial-spotlight" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} />}
    {!paused && interaction && !docked && <>
      <div className="tutorial-blocker" style={{ top: 0, left: 0, right: 0, height: interaction.top }} />
      <div className="tutorial-blocker" style={{ top: interaction.top + interaction.height, left: 0, right: 0, bottom: 0 }} />
      <div className="tutorial-blocker" style={{ top: interaction.top, left: 0, width: interaction.left, height: interaction.height }} />
      <div className="tutorial-blocker" style={{ top: interaction.top, left: interaction.left + interaction.width, right: 0, height: interaction.height }} />
    </>}
    <div ref={card} data-layout={layout?.mode || 'floating'} className={`tutorial-card ${paused ? 'tutorial-paused' : ''}`} role={paused ? 'complementary' : 'dialog'} aria-label={paused ? '新手教程进度' : '新手教程'} aria-labelledby={paused ? undefined : 'tutorial-title'} aria-describedby={!paused && detailsVisible ? 'tutorial-description' : undefined} tabIndex={-1} style={{ left: layout?.left ?? 12, top: layout?.top ?? 12, width: layout?.width ?? 350, maxHeight: layout?.maxHeight, visibility: layout ? 'visible' : 'hidden' }}>
      <div className="tutorial-card-top"><div className="tutorial-card-heading"><span><Icon name="sparkles" size={16} />新手教程 <b>{index + 1} / {tutorialSteps.length}</b></span>{docked && heading}</div><div className="tutorial-card-tools">{docked && layout?.compact && !paused && <button className="tutorial-description-toggle" aria-expanded={expanded} aria-controls="tutorial-description" onClick={() => setExpanded(value => !value)}>{expanded ? '收起说明' : '展开说明'}</button>}<button className="tutorial-close" aria-label="关闭新手教程" onClick={onSkip}>×</button></div></div>
      {!docked && <><div className="tutorial-progress" aria-hidden="true">{tutorialSteps.map(item => <i key={item.id} className={tutorialSteps.indexOf(item) <= index ? 'done' : ''} />)}</div>{heading}</>}
      {!paused && <div className="tutorial-card-body" hidden={!detailsVisible}><p id="tutorial-description">{current.text}</p>{layout && !layout.found && <p className="tutorial-target-missing">请返回当前步骤后继续。</p>}</div>}
      <div className="tutorial-card-controls"><div className="tutorial-card-actions">{paused ? <button className="secondary" onClick={onResume}>继续引导</button> : onBack && <button className="secondary" onClick={onBack}>上一步</button>}<button className="primary" onClick={!layout || layout.found ? onNext : onRecover}>{!layout || layout.found ? current.next : '返回这一步'}<Icon name="arrow" size={15} /></button></div>
        <div className="tutorial-card-footer">{paused ? <button className="tutorial-skip" onClick={onSkip}>退出教程</button> : <>{step !== 'plan' && <button className="tutorial-skip" onClick={onSkip}>跳过教程</button>}{step !== 'add' && <button className="tutorial-skip" onClick={onPause}>收起引导</button>}</>}</div>
      </div>
    </div>
  </div>, document.body);
}

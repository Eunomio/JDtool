'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

type Destination = 'home' | 'jobs' | 'detail' | 'projects' | 'categories' | 'compare' | 'interview' | 'scenario';
const primary = [{ id: 'home', label: '首页', icon: 'home' }, { id: 'jobs', label: '岗位清单', icon: 'jobs' }, { id: 'detail', label: '岗位详情', icon: 'detail' }, { id: 'projects', label: '我的项目', icon: 'projects' }] as const;
const secondary = [{ id: 'categories', label: '岗位归类', description: '整理相似岗位与分类', icon: 'layers' }, { id: 'compare', label: '岗位比较', description: '找到共同要求和差异', icon: 'compare' }, { id: 'interview', label: '模拟面试', description: '练习回答与追问', icon: 'interview' }, { id: 'scenario', label: '岗位体验', description: '处理真实风格的工作任务', icon: 'scenario' }] as const;
export default function MobileNavigation({ page, onNavigate }: { page: string; onNavigate: (page: Destination) => void }) {
  const [more, setMore] = useState(false); const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!more) return;
    const modal = dialog.current; if (!modal) return;
    modal.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { modal.close(); document.body.style.overflow = old; };
  }, [more]);
  function choose(id: Destination) { setMore(false); onNavigate(id); }
  return <><nav className="mobile-navigation" aria-label="底部导航">{primary.map(item => <button key={item.id} aria-label={item.label} aria-current={page === item.id ? 'page' : undefined} onClick={() => choose(item.id)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}<button aria-label="更多功能" aria-expanded={more} aria-controls="mobile-more" aria-current={secondary.some(item => item.id === page) ? 'page' : undefined} onClick={() => setMore(true)}><Icon name="menu" size={21} /><span>更多</span></button></nav><dialog className="mobile-more-dialog" id="mobile-more" ref={dialog} aria-labelledby="mobile-more-title" onCancel={() => setMore(false)} onClose={() => setMore(false)} onClick={event => { if (event.target === event.currentTarget) setMore(false); }}><div className="mobile-more-heading"><h2 id="mobile-more-title">更多功能</h2><button className="secondary small" aria-label="关闭更多功能" onClick={() => setMore(false)}>关闭</button></div><div className="mobile-more-links">{secondary.map(item => <button key={item.id} aria-label={item.label} aria-current={page === item.id ? 'page' : undefined} onClick={() => choose(item.id)}><span className="icon-tile"><Icon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><Icon name="chevron" size={17} /></button>)}</div></dialog></>;
}

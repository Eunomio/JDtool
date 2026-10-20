'use client';

import { useState, type FormEvent } from 'react';
import { database, projectStages, type Project, type Source } from '../lib/database';
import { api, displayText } from '../lib/client';
import { readDocument } from '../lib/document-reader';
import { sampleProjects } from '../lib/samples';
import { deleteProjects, saveProject } from '../lib/project-storage';

type Candidate = Omit<Project, 'id' | 'facts' | 'sources' | 'confirmed' | 'visibility' | 'redactions' | 'updatedAt'> & { facts: { text: string; sourceText: string; category: string }[]; suggestedRedactions: { from: string; to: string }[] };
function emptyProject(): Project { return { id: crypto.randomUUID(), name: '', type: '', stage: '构思/进行中', timeline: '', role: '', problem: '', actions: '', methods: '', results: '', skills: [], facts: [], sources: [], confirmed: false, visibility: 'private', redactions: [], updatedAt: new Date().toISOString() }; }

export default function Projects({ projects, refresh, onDeleted, allowSamples = false }: { projects: Project[]; refresh: () => Promise<void>; onDeleted: () => void; allowSamples?: boolean }) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [sourceLabel, setSourceLabel] = useState('手动输入');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [editor, setEditor] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [privateImport, setPrivateImport] = useState(true);
  const duplicateOf = (candidate: Candidate) => projects.find((project) => project.name.replace(/[\s\p{P}]/gu, '').toLowerCase() === candidate.name.replace(/[\s\p{P}]/gu, '').toLowerCase());

  async function run(task: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await task(); } catch (error) { setError(error instanceof Error ? error.message : '暂时无法完成，请重试。'); }
    finally { setBusy(false); }
  }

  function openCandidate(candidate: Candidate, target?: Project) {
    const source: Source = { id: crypto.randomUUID(), label: sourceLabel, url, text, collectedAt: new Date().toISOString() };
    setEditor({ ...(target || emptyProject()), ...(target ? {} : candidate),
      facts: [...(target?.facts || []), ...candidate.facts.filter((fact) => !target?.facts.some((existing) => existing.text === fact.text)).map((fact) => ({ ...fact, id: crypto.randomUUID() }))],
      sources: [...(target?.sources || []), source], redactions: [...(target?.redactions || []), ...candidate.suggestedRedactions],
      visibility: privateImport ? 'private' : 'display', confirmed: false,
    });
    setMessage(target ? `已合并新旧事实与来源。请核对本人角色和项目阶段：已有记录为“${target.stage}”，新资料为“${candidate.stage}”。` : '请对照来源核对项目事实。');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const fields = new FormData(event.currentTarget);
    await run(async () => {
      const values = Object.fromEntries(['name', 'type', 'stage', 'timeline', 'role', 'problem', 'actions', 'methods', 'results'].map((key) => [key, String(fields.get(key) || '').trim()]));
      if (!values.name) throw new Error('请填写项目名称。');
      const lines = String(fields.get('facts') || '').split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) throw new Error('请至少保留一条可核对的项目事实。');
      const facts = lines.map((line) => editor.facts.find((fact) => fact.text === line) || { id: crypto.randomUUID(), text: line, sourceText: line, category: '本人补充' });
      const added = facts.filter((fact) => !editor.facts.some((original) => original.id === fact.id));
      const sources = [...editor.sources];
      if (added.length) sources.push({ id: crypto.randomUUID(), label: '本人补充并核对', url: '', text: added.map((fact) => fact.text).join('\n'), collectedAt: new Date().toISOString() });
      const redactions = String(fields.get('redactions') || '').split('\n').map((line) => { const split = line.indexOf('=>'); return split >= 0 ? { from: line.slice(0, split).trim(), to: line.slice(split + 2).trim() } : { from: '', to: '' }; }).filter((rule) => rule.from);
      await saveProject({ ...editor, ...values, facts, sources, skills: String(fields.get('skills') || '').split(/[，,、]/).map((skill) => skill.trim()).filter(Boolean), confirmed: fields.get('confirmed') === 'on', visibility: fields.get('visibility') === 'display' ? 'display' : 'private', redactions, updatedAt: new Date().toISOString() });
      await refresh(); setCandidates((items) => items.filter((item) => item.name !== editor.name)); setEditor(null); setMessage('项目已保存，可在岗位详情中推荐与组装。');
    });
  }

  return <div className="page-stack"><div className="section-heading"><div><h1>我的项目</h1><p className="muted">保留真实经历，为不同岗位选择合适的讲述重点。</p></div><button className="primary" onClick={() => setEditor(emptyProject())}>新增项目</button></div>
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
    {editor ? <section className="panel"><div className="section-heading"><h2>核对项目事实</h2><button className="text-button" onClick={() => setEditor(null)}>取消</button></div><form onSubmit={save}>
      <div className="field-pair"><label>项目名称<input name="name" required defaultValue={editor.name} /></label><label>项目类型<input name="type" defaultValue={editor.type} placeholder="研究、工作、课程、个人项目等" /></label></div>
      <div className="field-pair"><label>项目阶段<select name="stage" defaultValue={editor.stage}>{projectStages.map((stage) => <option key={stage}>{stage}</option>)}</select></label><label>时间<input name="timeline" defaultValue={editor.timeline} /></label></div>
      <label>本人角色<input name="role" defaultValue={editor.role} /></label>
      {([['problem', '问题与目标'], ['actions', '具体做法'], ['methods', '方法与工具'], ['results', '实际结果或当前进展']] as const).map(([key, label]) => <label key={key}>{label}<textarea name={key} rows={3} defaultValue={editor[key]} /></label>)}
      <label>技能<input name="skills" defaultValue={editor.skills.join('、')} /></label><label>事实条目<textarea name="facts" rows={7} defaultValue={editor.facts.map((fact) => fact.text).join('\n')} placeholder="每行一条事实，只写本人实际做过的工作与可核实结果" required /></label>
      <details><summary>回看项目来源与原句</summary>{editor.sources.map((source) => <div key={source.id}><h3>{source.label}</h3>{source.url && <a href={source.url} target="_blank" rel="noreferrer">查看来源</a>}<pre className="source-text">{source.text}</pre></div>)}{editor.facts.map((fact) => <blockquote key={fact.id}><strong>{fact.text}</strong><p>{fact.sourceText}</p></blockquote>)}</details>
      <fieldset><legend>可公开程度与脱敏</legend><label className="inline"><input name="visibility" type="radio" value="private" defaultChecked={editor.visibility === 'private'} />仅自己查看</label><label className="inline"><input name="visibility" type="radio" value="display" defaultChecked={editor.visibility === 'display'} />生成可展示版本</label><label>替换规则<textarea name="redactions" rows={4} defaultValue={editor.redactions.map((rule) => `${rule.from} => ${rule.to}`).join('\n')} placeholder={'每行一个替换，例如：\n内部产品名 => 某专业软件\n姓名 => 求职者'} onChange={(event) => { const redactions = event.target.value.split('\n').map((line) => { const [from, ...to] = line.split('=>'); return { from: from.trim(), to: to.join('=>').trim() }; }).filter((rule) => rule.from); setEditor((current) => current ? { ...current, redactions } : null); }} /></label><p className="muted">可展示版本在推荐与复制前应用替换，保留原始事实。</p><details><summary>预览替换结果</summary><pre className="source-text">{displayText([editor.name, editor.role, ...editor.facts.map((fact) => fact.text)].join('\n'), { ...editor, visibility: 'display' })}</pre></details></fieldset>
      <label className="inline"><input name="confirmed" type="checkbox" defaultChecked={editor.confirmed} />我已核对本人角色、项目阶段、事实与结果</label><button className="primary" disabled={busy}>保存项目事实</button>
    </form></section> : <>
      <section className="panel"><h2>从简历或作品集整理项目</h2><p className="privacy-note">所选内容在点击解析后用于本次整理；扫描PDF的文字识别也会发送所选页面。请先去掉无需使用的个人信息。</p>
        <div className="field-pair"><label>上传简历<input type="file" accept=".docx,.pdf,.txt,.md" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(async () => { setText(await readDocument(file)); setSourceLabel(file.name); setCandidates([]); setMessage('已读取文件，请核对下方文字再解析。'); }); event.target.value = ''; }} /></label><label>公开作品集链接<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="也可直接粘贴项目文字" /><button className="text-button" disabled={busy || !url} onClick={() => run(async () => { const source = await api<{ text: string; sourceUrl: string }>('/api/sources/extract', { url }); setText(source.text); setSourceLabel('公开作品集'); })}>读取作品集</button></label></div>
        <label>简历或项目文字<textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} maxLength={80000} placeholder="粘贴完整简历，或直接描述一个项目的背景、本人行动和结果" /></label><label className="inline"><input type="checkbox" checked={privateImport} onChange={(event) => setPrivateImport(event.target.checked)} />导入后默认仅自己查看</label>
        <div className="actions"><button className="primary" disabled={busy || !text.trim()} onClick={() => run(async () => { const result = await api<{ projects: Candidate[] }>('/api/assist', { action: 'projects', text }); if (!result.projects.length) throw new Error('没有识别到项目，请补充本人角色、做法或结果。'); setCandidates(result.projects); })}>{busy ? '正在整理…' : '解析为项目事实'}</button>{allowSamples && <button className="secondary" disabled={busy} onClick={() => run(async () => { await database.projects.bulkPut(sampleProjects().filter((project) => !projects.some((current) => current.id === project.id))); await refresh(); setMessage('已添加5个脱敏示例项目，可查看事实来源。'); })}>使用脱敏示例项目</button>}</div>
      </section>
      {candidates.length > 0 && <section className="panel"><h2>待核对的项目</h2>{candidates.map((candidate, index) => { const duplicate = duplicateOf(candidate); return <div className="candidate" key={index}><h3>{candidate.name}</h3><p>{candidate.role} · {candidate.stage}</p><p>{candidate.facts.map((fact) => fact.text).join('；')}</p>{duplicate && <p className="notice">已有同名项目，建议合并事实与来源后再核对。</p>}<button className="secondary" onClick={() => openCandidate(candidate, duplicate)}>{duplicate ? '核对并合并' : '核对并新增'}</button>{duplicate && <button className="text-button" onClick={() => openCandidate(candidate)}>仍作为新项目</button>}<label>与已有项目合并<select defaultValue="" onChange={(event) => { const target = projects.find((project) => project.id === event.target.value); if (target) openCandidate(candidate, target); }}><option value="">选择同一个项目，合并后再核对</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>; })}</section>}
      <div className="project-grid">{projects.map((project) => <article className="panel" key={project.id}><p className="eyebrow">{project.sample ? '脱敏示例 · ' : ''}{project.stage}</p><h2>{displayText(project.name, project)}</h2><p>{displayText(project.role, project)}</p><p className="muted">{project.confirmed ? '事实已确认' : '待核对事实'} · {project.visibility === 'display' ? '可展示版本' : '仅自己查看'}</p><ul>{project.facts.slice(0, 3).map((fact) => <li key={fact.id}>{displayText(fact.text, project)}</li>)}</ul><div className="actions"><button className="text-button" onClick={() => setEditor(project)}>编辑与核对</button><button className="text-button danger" onClick={() => { if (window.confirm(`删除项目“${project.name}”？相关生成文案与由其加入的计划也会清除，岗位和其他项目会保留。`)) void run(async () => { await deleteProjects(project.id); onDeleted(); await refresh(); }); }}>删除项目</button></div></article>)}</div>
      <button className="text-button danger" onClick={() => { if (window.confirm('清除简历、来源原文、项目事实及相关生成文案和计划？岗位记录会保留。')) void run(async () => { await deleteProjects(); onDeleted(); await refresh(); setText(''); setCandidates([]); }); }}>清除简历与项目资料</button>
    </>}
  </div>;
}

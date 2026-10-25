'use client';
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from 'react';
import { database } from '../lib/database';
import { degrees, emptyPersonalProfile, personalProfileSchema, type PersonalProfile } from '../lib/personal-profile';
import Projects from './projects';
import VoiceTextarea from './voice-textarea';
import { Tabs } from './ui';

const tabs = [{ id: 'profile', label: '基本信息', icon: 'detail' }, { id: 'projects', label: '项目经历', icon: 'projects' }] as const;
export default function MyInformation({ profile, beforeSaved, ...projectProps }: ComponentProps<typeof Projects> & { profile?: PersonalProfile; beforeSaved: () => Promise<void> }) {
  const [tab, setTab] = useState<'profile' | 'projects'>('projects');
  return <div className="page-stack my-information"><h1>我的信息</h1><Tabs label="我的信息内容" className="content-tabs" value={tab} items={tabs} onChange={setTab} />
    <div role="tabpanel" id="我的信息内容-panel-profile" aria-labelledby="我的信息内容-profile" hidden={tab !== 'profile'}><ProfileEditor profile={profile} onSaved={async () => { await projectProps.refresh(); await beforeSaved(); }} /></div>
    <div role="tabpanel" id="我的信息内容-panel-projects" aria-labelledby="我的信息内容-projects" hidden={tab !== 'projects'}><Projects {...projectProps} /></div>
  </div>;
}

function ProfileEditor({ profile, onSaved }: { profile?: PersonalProfile; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<PersonalProfile>(() => profile || emptyPersonalProfile());
  const [skills, setSkills] = useState(profile?.skills.join('、') || '');const [years, setYears] = useState(profile?.experienceYears === undefined ? '' : String(profile.experienceYears));
  const [busy, setBusy] = useState(false);const [error, setError] = useState('');const [message, setMessage] = useState('');const dirty = useRef(false);const baseVersion = useRef(profile?.updatedAt);
  useEffect(() => { if (!dirty.current) { setDraft(profile || emptyPersonalProfile());setSkills(profile?.skills.join('、') || '');setYears(profile?.experienceYears === undefined ? '' : String(profile.experienceYears));baseVersion.current = profile?.updatedAt; } }, [profile]);
  function change(value: Partial<PersonalProfile>) { dirty.current = true;setDraft(current => ({ ...current, ...value }));setMessage(''); }
  async function save(event: FormEvent) {
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try {
      const result = personalProfileSchema.safeParse({ ...draft, experienceYears: years === '' ? undefined : Number(years), skills: [...new Set(skills.split(/[,，、;；\n]+/).map(item => item.trim()).filter(Boolean))], updatedAt: new Date().toISOString() });
      if (!result.success) throw Error(result.error.issues.some(item => item.message === '毕业时间不能早于入学时间') ? '毕业时间不能早于入学时间，请核对教育经历。' : '请检查填写内容：技能最多50项，每项不超过80字，个人简介不超过3000字。');
      await database.transaction('rw', database.profiles, async () => { const current = await database.profiles.get('personal');if (current?.updatedAt !== baseVersion.current) throw Error('基本信息已在其他页面更新，请刷新后再保存。');await database.profiles.put(result.data); });
      baseVersion.current = result.data.updatedAt;dirty.current = false;setDraft(result.data);await onSaved();setMessage('基本信息已保存。');
    } catch (problem) { setError(problem instanceof Error ? problem.message : '暂未保存，请稍后重试。'); }
    finally { setBusy(false); }
  }
  return <form className="panel personal-profile-form" onSubmit={save} aria-label="基本信息"><h2>基本信息</h2>
    {error && <p className="notice error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <fieldset disabled={busy}><div className="field-pair"><label>姓名或称呼<input maxLength={80} value={draft.name} onChange={event => change({ name: event.target.value })} /></label><label>求职城市<input maxLength={150} value={draft.location} onChange={event => change({ location: event.target.value })} placeholder="例如：上海、杭州" /></label><label>意向岗位<input maxLength={150} value={draft.targetRole} onChange={event => change({ targetRole: event.target.value })} /></label><label>工作年限<input type="number" min={0} max={60} step={0.5} value={years} onChange={event => { dirty.current = true;setYears(event.target.value);setMessage(''); }} placeholder="应届生可填0" /></label></div>
      <section className="profile-education"><div className="section-heading"><h3>教育经历</h3><button type="button" className="secondary" disabled={draft.education.length >= 8} onClick={() => change({ education: [...draft.education, { id: crypto.randomUUID(), school: '', major: '', degree: '', startMonth: '', endMonth: '' }] })}>添加教育经历</button></div>
        {draft.education.map((education, index) => <fieldset className="education-card" key={education.id} aria-label={`教育经历${index + 1}`}><legend>教育经历 {index + 1}</legend><div className="field-pair">{(['school', 'major'] as const).map(key => <label key={key}>{key === 'school' ? '学校' : '专业'}<input maxLength={150} value={education[key]} onChange={event => change({ education: draft.education.map(item => item.id === education.id ? { ...item, [key]: event.target.value } : item) })} /></label>)}<label>学历<select aria-label="学历" value={education.degree} onChange={event => change({ education: draft.education.map(item => item.id === education.id ? { ...item, degree: event.target.value as typeof education.degree } : item) })}><option value="">请选择</option>{degrees.map(degree => <option key={degree}>{degree}</option>)}</select></label>{(['startMonth', 'endMonth'] as const).map(key => <label key={key}>{key === 'startMonth' ? '入学时间' : '毕业时间'}<input type="month" value={education[key]} onChange={event => change({ education: draft.education.map(item => item.id === education.id ? { ...item, [key]: event.target.value } : item) })} /></label>)}</div><button type="button" className="text-button danger" onClick={() => change({ education: draft.education.filter(item => item.id !== education.id) })}>移除此段教育经历</button></fieldset>)}
      </section>
      <label className="profile-long-field">技能<VoiceTextarea aria-label="技能" rows={3} value={skills} onChange={event => { dirty.current = true;setSkills(event.target.value);setMessage(''); }} placeholder="例如：用户研究、Figma、Python。多项技能可用顿号或换行分隔。" /></label>
      <label className="profile-long-field">个人简介<VoiceTextarea aria-label="个人简介" rows={4} maxLength={3000} value={draft.summary} onChange={event => change({ summary: event.target.value })} placeholder="可补充求职方向、擅长的工作或其他希望保留的信息" /></label>
      <div className="actions"><button className="primary" type="submit">{busy ? '正在保存…' : '保存基本信息'}</button></div>
    </fieldset>
  </form>;
}

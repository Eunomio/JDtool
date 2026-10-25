import type { Job, Project, Recommendation } from '../lib/database';
import { projectMatch } from '../lib/project-match';
import { displayProjectText } from '../lib/client';

export function ProjectMatchBadge({ job, projects, recommendation, stale = false }: { job: Job; projects: Project[]; recommendation?: Recommendation; stale?: boolean }) {
  const match = projectMatch(job, recommendation ? [recommendation] : [], projects);
  return <span className="project-match-badge">{!stale && match.score !== null ? <><strong>{match.score}%</strong> 岗位匹配度</> : stale ? '匹配度待更新' : '推荐后查看匹配度'}</span>;
}
export function ProjectMatchSummary({ job, projects, recommendations, stale = false }: { job: Job; projects: Project[]; recommendations: Recommendation[]; stale?: boolean }) {
  const match = projectMatch(job, recommendations, projects);
  if (stale) return <div className="project-match-summary"><h3>岗位匹配度</h3><p>岗位或项目资料有更新，重新推荐后可查看最新匹配度。</p></div>;
  if (match.score === null) return <div className="project-match-summary"><h3>岗位匹配度</h3><p>{!match.total ? '先补充JD职责与要求，再分析项目匹配度。' : '点击“AI推荐项目”或“重新推荐与改写”，查看项目能回应哪些岗位要求。'}</p></div>;
  return <section className="project-match-summary" aria-label="所选项目与岗位的匹配度"><div className="project-match-overview"><div><h3>所选项目与岗位的匹配度</h3><p>{match.direct}项直接相关 · {match.transferable}项方法可迁移 · {match.missing}项待补充</p></div><strong className="project-match-score">{match.score}<span>%</span></strong></div><progress aria-label="岗位要求覆盖比例" max={100} value={match.score} /><p className="project-match-method">按JD要求与已确认事实计算，方法可迁移按半项计。仅反映本轮已分析项目的覆盖情况。</p><details><summary>查看逐项匹配依据</summary><ul className="project-match-evidence">{match.criteria.map(criterion => {
    const row = match.coverage.get(criterion.id); const facts = projects.filter(project => project.confirmed && recommendations.some(item => item.projectId === project.id)).flatMap(project => project.facts.filter(fact => row?.factIds.includes(fact.id)).map(fact => displayProjectText(fact.text, projects)));
    return <li key={criterion.id}><span className={`match-level ${row?.kind || 'missing'}`}>{row?.kind === 'direct' ? '直接相关' : row ? '方法可迁移' : '待补充'}</span><strong>{criterion.text}</strong>{facts.length ? <p>{facts.join('；')}</p> : <p>目前项目事实中还没有足够依据。</p>}</li>;
  })}</ul></details></section>;
}

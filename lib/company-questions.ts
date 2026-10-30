import type { Advice } from './database';

type QuestionJob = { title: string; responsibilities?: { id: string; text: string }[]; requirements?: { id: string; text: string }[] };
type QuestionSource = { id: string; text: string };
const normalize = (text: string) => text.replace(/\s+/g, '');
const topic = (text: string) => text.replace(/\s+/g, ' ').trim().replace(/[。；;]+$/, '').slice(0, 120);

// Questions can ask about an actual JD requirement without claiming a company fact.
// Company-specific examples still need a literal source quote.
export function completeCompanyQuestions(job: QuestionJob, candidates: Advice[], sources: QuestionSource[], business: Advice[] = []): Advice[] {
  const requirements = [...(job.responsibilities || []), ...(job.requirements || [])].filter(row => row.id && row.text.trim());
  const allowed = new Set(requirements.map(row => row.id));
  const quotesFor = (row: Advice) => (row.sourceQuotes || []).filter(quote => normalize(quote.quote).length >= 8 && row.sourceIds.includes(quote.sourceId) && sources.some(source => source.id === quote.sourceId && normalize(source.text).includes(normalize(quote.quote))));
  const questions: Advice[] = [];
  const seen = new Set<string>();
  const add = (row: Advice) => {
    const text = row.text.trim(); const key = normalize(text).replace(/[，。！？、：；,.!?:;“”「」]/g, '');
    if (text && !seen.has(key) && questions.length < 3) { seen.add(key); questions.push({ ...row, text }); }
  };
  for (const row of candidates) {
    const requirementIds = [...new Set(row.requirementIds.filter(id => allowed.has(id)))];
    const sourceQuotes = quotesFor(row); const sourceIds = [...new Set(sourceQuotes.map(quote => quote.sourceId))];
    // An invalid supplied quote must not survive just because the row also names a JD ID.
    if ((!requirementIds.length && !sourceIds.length) || (row.sourceQuotes?.length && !sourceQuotes.length)) continue;
    add({ text: row.text, reason: row.reason, requirementIds, factIds: [], sourceIds, ...(sourceQuotes.length ? { sourceQuotes, ...(row.example?.trim() ? { example: row.example.trim() } : {}) } : {}) });
  }
  if (questions.length >= 2) return questions;

  const duty = requirements[0];
  if (duty) add({ text: `围绕“${topic(duty.text)}”，入职后最先要完成哪些工作，主要交付物是什么？`, reason: 'JD提到了这项要求，可向面试官确认实际工作范围和交付要求。', requirementIds: [duty.id], factIds: [], sourceIds: [] });
  if (questions.length >= 2) return questions;

  const known = business.find(row => row.text.trim() && quotesFor(row).length);
  if (known) {
    const sourceQuotes = quotesFor(known);
    add({ text: `公开资料提到“${topic(known.text)}”，这个岗位具体会参与哪些工作，需要和哪些团队配合？`, reason: '结合已核实的公司业务，确认岗位负责的范围和协作方式。', requirementIds: [], factIds: [], sourceIds: [...new Set(sourceQuotes.map(quote => quote.sourceId))], sourceQuotes });
  }
  if (questions.length >= 2) return questions;

  const focus = requirements[1] || duty;
  if (focus) add({ text: `对于“${topic(focus.text)}”，团队目前怎样评价工作成果，最看重哪些结果？`, reason: '结合JD要求，确认团队的评价方式，便于准备相关经历。', requirementIds: [focus.id], factIds: [], sourceIds: [] });
  const title = topic(job.title) || '这个岗位';
  if (questions.length < 2) add({ text: `“${title}”入职前三个月的主要任务和交付要求是什么？`, reason: '确认岗位的近期任务，判断应优先准备哪些内容。', requirementIds: [], factIds: [], sourceIds: [] });
  if (questions.length < 2) add({ text: `团队怎样评价“${title}”的工作成果，需要和哪些角色配合？`, reason: '确认工作评价方式和团队分工，便于准备面试。', requirementIds: [], factIds: [], sourceIds: [] });
  return questions;
}

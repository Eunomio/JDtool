import type { PracticeState } from './practice-conversation';
type Draft = { version: string; at: string; fields: Pick<PracticeState, 'answer' | 'supplement' | 'question' | 'choice'> };
const fields = (state: PracticeState) => ({ answer: state.answer, supplement: state.supplement, question: state.question, choice: state.choice });
const keyFor = (accountId: string, sessionId: string) => `jdtool-practice-draft:${accountId}:${sessionId}`;
export function cachePracticeDraft(accountId: string, sessionId: string, version: string, state: PracticeState) {
  try { localStorage.setItem(keyFor(accountId, sessionId), JSON.stringify({ version, at: new Date().toISOString(), fields: fields(state) })); } catch { /* IndexedDB saving still runs if browser storage is full. */ }
}
export function recoverPracticeDraft(accountId: string, sessionId: string, version: string, updatedAt: string, state: PracticeState) {
  try {
    const cached: Draft = JSON.parse(localStorage.getItem(keyFor(accountId, sessionId)) || 'null');
    if (!cached || cached.version !== version || typeof cached.at !== 'string' || cached.at <= updatedAt || state.pendingMessage || state.feedback || !cached.fields || !(['answer', 'supplement', 'question', 'choice'] as const).every(field => typeof cached.fields[field] === 'string')) return state;
    return { ...state, ...fields(cached.fields as PracticeState), ...(state.followup ? { answer: state.answer } : {}) };
  } catch { return state; }
}
export function clearSavedPracticeDraft(accountId: string, sessionId: string, state: PracticeState) {
  try { const cached: Draft = JSON.parse(localStorage.getItem(keyFor(accountId, sessionId)) || 'null'); if (cached && JSON.stringify(cached.fields) === JSON.stringify(fields(state))) localStorage.removeItem(keyFor(accountId, sessionId)); } catch { /* Draft recovery is optional when storage is unavailable. */ }
}
export function discardPracticeDrafts(accountId: string, sessionIds: string[]) {
  for (const sessionId of sessionIds) try { localStorage.removeItem(keyFor(accountId, sessionId)); } catch { /* Storage may be unavailable. */ }
}

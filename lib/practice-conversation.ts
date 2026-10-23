import type { PracticeFeedback } from './database';
import type { Exercise } from './exercises';

export type MessageKind = 'question' | 'plan' | 'answer' | 'supplement';
export type PendingMessage = { node: number; kind: MessageKind; text: string };
export type PracticeMove = { node: number; action: string; dialogue: string; consequence: string; kind?: 'question' | 'plan'; colleague?: string };
export type PracticeState = { exercise?: Exercise; answer: string; followup: string; supplement: string; feedback: PracticeFeedback | null; node: number; moves: PracticeMove[]; choice: string; question: string; response: { dialogue: string; consequence: string } | null; pendingMessage?: PendingMessage; reviewOpen?: boolean };
export function emptyPractice(): PracticeState { return { answer: '', followup: '', supplement: '', feedback: null, node: 0, moves: [], choice: '', question: '', response: null }; }
export function moveKind(move: PracticeMove) { return move.kind || (move.action.startsWith('向同事提问：') ? 'question' : 'plan'); }
export function moveText(move: PracticeMove) { return moveKind(move) === 'question' ? move.action.replace(/^向同事提问：/, '') : move.action; }
export function taskSubmitted(state: PracticeState, node = state.node) { return state.moves.some(move => move.node === node && moveKind(move) === 'plan') || node === state.node && !!state.response?.consequence; }
export function restorePractice(data: Record<string, unknown>): PracticeState {
  const state = { ...emptyPractice(), ...data } as PracticeState;
  if (state.reviewOpen === undefined) state.reviewOpen = !!state.feedback;
  return state;
}

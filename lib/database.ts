import Dexie, { type Table } from 'dexie';
import type { RoleCategoryId, RoleClassification } from './role-taxonomy';

export const statuses = ['关注中', '准备投递', '已投递', '笔试/测评', '面试中', '已获Offer', '已结束'] as const;
export type JobStatus = typeof statuses[number];
export type Job = {
  id: string;
  title: string;
  company: string;
  content: string;
  sourceUrl?: string;
  sourceType?: 'link' | 'images' | 'text';
  images?: { name: string; dataUrl: string }[];
  location?: string;
  direction?: string;
  classification?: RoleClassification;
  categoryOverride?: RoleCategoryId;
  hiringType?: string;
  responsibilities?: { id: string; text: string; sourceText: string }[];
  requirements?: { id: string; text: string; sourceText: string }[];
  warnings?: string[];
  parsedAt?: string;
  sample?: boolean;
  applicationDate?: string;
  interviewDate?: string;
  endReason?: string;
  statusHistory?: { status: JobStatus; at: string }[];
  status: JobStatus;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
};

export const projectStages = ['构思/进行中', '原型', '已测试', '已上线'] as const;
export type Source = { id: string; jobId?: string; label: string; url: string; text: string; collectedAt: string; kind?: 'web' | 'snippet'; publishedAt?: string };
export type ProjectFact = { id: string; text: string; sourceText: string; category: string };
export type Project = {
  id: string; name: string; type: string; stage: string; timeline: string; role: string;
  problem: string; actions: string; methods: string; results: string; skills: string[];
  facts: ProjectFact[]; sources: Source[]; confirmed: boolean; sample?: boolean;
  visibility: 'private' | 'display'; redactions: { from: string; to: string }[]; updatedAt: string;
};
export type Advice = { text: string; reason: string; requirementIds: string[]; factIds: string[]; sourceIds: string[]; sourceQuotes?: { sourceId: string; quote: string }[] };
export type GeneratedBullet = { text: string; factIds: string[]; adopted?: boolean };
export type Recommendation = { projectId: string; rank: number; role: 'primary' | 'supporting'; matchType: 'direct' | 'transferable' | 'needs_more'; requirementIds: string[]; factIds: string[]; reason: string; resumeBullets: GeneratedBullet[]; interviewOutline: GeneratedBullet[] };
export type RecommendationResult = { recommendations: Recommendation[]; gaps: Advice[]; needsReview: string[] };
export type PreparationResult = { priorities: Advice[]; strengths: Advice[]; gaps: Advice[]; companyResearch: Advice[] };
export type CompanyResult = { facts: Advice[]; hypotheses: Advice[]; questions: Advice[]; research?: { company: string; summary: string; identityNote: string; queries: string[]; searchedAt: string }; roleInsights?: Advice[]; businesses?: Advice[] };
export type CompareResult = { common: Advice[]; differences: { jobId: string; uniqueRequirements: Advice[]; projects: Advice[]; preparation: Advice[] }[]; reusable: Advice[] };
export type SavedResult<T> = { id: string; jobId: string; inputVersion: string; projectVersions?: { id: string; updatedAt: string }[]; createdAt: string; data: T };
export type Task = { id: string; text: string; jobIds: string[]; done: boolean; order: number; createdAt: string };
export type PracticeFeedback = { strengths: string[]; dimensions: { name: string; feedback: string; requirementIds: string[] }[]; improvements: string[]; outline: string[]; nextActions: string[] };
export type PracticeSession = { id: string; jobId: string; type: 'interview' | 'scenario'; inputVersion: string; data: Record<string, unknown>; updatedAt: string };

class JobDatabase extends Dexie {
  jobs!: Table<Job, string>;
  projects!: Table<Project, string>;
  sources!: Table<Source, string>;
  recommendations!: Table<SavedResult<RecommendationResult>, string>;
  preparations!: Table<SavedResult<PreparationResult>, string>;
  companies!: Table<SavedResult<CompanyResult>, string>;
  comparisons!: Table<SavedResult<CompareResult>, string>;
  tasks!: Table<Task, string>;
  practice!: Table<PracticeSession, string>;

  constructor() {
    super('jdtool');
    this.version(1).stores({ jobs: 'id, status, updatedAt' });
    this.version(2).stores({
      jobs: 'id, status, updatedAt', projects: 'id, name, updatedAt', sources: 'id, jobId',
      recommendations: 'id, jobId, createdAt', preparations: 'id, jobId, createdAt', companies: 'id, jobId, createdAt',
      comparisons: 'id, jobId, createdAt', tasks: 'id, order', practice: 'id, jobId, type, updatedAt',
    });
  }
}

export const database = new JobDatabase();

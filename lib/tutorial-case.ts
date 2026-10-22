import type { Advice, CompanyResult, Job, PreparationResult, Project, RecommendationResult, Source, Task } from './database';
import { roleInputVersion } from './role-taxonomy';

// Presentation-only fixtures. These objects never belong to an account workspace.
const date = '2026-10-22T00:00:00.000Z';
const responsibilities = ['梳理团队创建、分配和跟进任务的核心流程，设计易用的交互方案。', '通过用户访谈和可用性测试发现问题，与产品和研发协作推进改进。'];
const requirements = ['能够用流程图、原型表达方案，并解释设计取舍。', '具备用户研究和可用性测试能力，能结合反馈验证方案。'];
const job: Job = {
  id: 'tutorial-job', title: '交互设计师（协作产品）', company: '星桥协作', location: '上海', direction: '协作产品体验', hiringType: '校招',
  content: `星桥协作｜交互设计师（协作产品）\n校园招聘 · 上海\n岗位职责：\n${responsibilities.join('\n')}\n任职要求：\n${requirements.join('\n')}`,
  sourceType: 'text', responsibilities: responsibilities.map((text, index) => ({ id: `tutorial-d${index + 1}`, text, sourceText: text })),
  requirements: requirements.map((text, index) => ({ id: `tutorial-r${index + 1}`, text, sourceText: text })),
  status: '准备投递', nextAction: '整理一个从发现问题到验证方案的完整案例', createdAt: date, updatedAt: date,
};
job.classification = { categoryId: 'experience_design', confidence: 'high', reason: '职责重点是核心流程、交互原型和可用性验证，因此归为用户体验设计。', evidence: responsibilities, inputVersion: roleInputVersion(job), classifiedAt: date };
const project: Project = {
  id: 'tutorial-project', name: '校园活动报名流程优化', type: '课程项目', stage: '已测试', timeline: '大三课程项目', role: '用户研究与交互设计',
  problem: '同学找不到报名入口，填写表单时反复返回查找说明。', actions: '访谈同学，梳理报名路径，设计原型并组织可用性测试。', methods: '用户访谈、任务流程、交互原型、可用性测试', results: '完成原型测试，整理入口与表单说明的改进建议。',
  skills: ['用户访谈', '交互原型', '可用性测试'], confirmed: true, visibility: 'private', redactions: [], sources: [], updatedAt: date,
  facts: [
    { id: 'tutorial-f1', text: '访谈参与活动的同学，整理报名入口与表单理解上的障碍。', sourceText: '访谈参与活动的同学，整理报名入口与表单理解上的障碍。', category: '研究' },
    { id: 'tutorial-f2', text: '梳理报名任务流程，设计并测试交互原型，形成改进建议。', sourceText: '梳理报名任务流程，设计并测试交互原型，形成改进建议。', category: '设计与验证' },
  ],
};
const sources: Source[] = [{ id: 'tutorial-source', jobId: job.id, label: '星桥协作业务设定（教程示例）', url: '', collectedAt: date, text: '星桥协作为小型团队提供任务管理与项目协作工具。核心场景是创建任务、分配负责人和跟进项目进度。当前希望改善新成员首次创建任务的体验。' }];
function advice(text: string, reason: string, requirementIds = ['tutorial-r1'], factIds: string[] = [], sourceIds: string[] = []): Advice { return { text, reason, requirementIds, factIds, sourceIds }; }
const company: CompanyResult = {
  facts: [advice('为小型团队提供任务管理与项目协作工具', '理解目标用户是项目负责人和团队成员。', [], [], ['tutorial-source'])],
  businesses: [advice('围绕创建任务、分配负责人和跟进进度设计产品', '先理解用户需要完成的任务，再分析页面和流程。', [], [], ['tutorial-source'])],
  roleInsights: [advice('这个岗位需要改善新成员首次创建任务的体验', '对应JD中的核心流程设计与可用性验证。', ['tutorial-d1', 'tutorial-r2'], [], ['tutorial-source'])],
  hypotheses: [advice('可能需要区分负责人和普通成员的操作习惯', '两类用户的任务不同，具体研究安排可在面试时确认。', ['tutorial-r2'], [], ['tutorial-source'])],
  questions: [advice('团队目前如何判断首次创建任务的体验是否改善？', '了解现有研究方式、观察指标和设计协作流程。', ['tutorial-r2'], [], ['tutorial-source'])],
};
const recommendations: RecommendationResult = { recommendations: [{
  projectId: project.id, rank: 1, role: 'primary', matchType: 'transferable', requirementIds: ['tutorial-r1', 'tutorial-r2'], factIds: ['tutorial-f1', 'tutorial-f2'],
  reason: '报名与创建协作任务都涉及入口发现、流程理解和表单操作，研究与验证方法可以迁移。',
  resumeBullets: [{ text: '围绕校园活动报名中的入口与表单理解问题，开展用户访谈、梳理任务流程，并通过交互原型测试形成改进建议。', factIds: ['tutorial-f1', 'tutorial-f2'] }],
  interviewOutline: [{ text: '先说明用户遇到的问题，再展示如何从访谈定位障碍、提出原型并测试；最后解释这些方法如何用于协作产品的新成员体验。', factIds: ['tutorial-f1', 'tutorial-f2'] }],
}], gaps: [], needsReview: [] };
const preparation: PreparationResult = {
  priorities: [advice('准备一个从发现问题到验证方案的设计案例', '岗位同时看重流程表达、设计取舍与方案验证。', ['tutorial-r1', 'tutorial-r2'])],
  strengths: [advice('用报名流程项目说明研究如何支持设计决策', '保留课程项目的背景，重点讲本人做过的研究与原型工作。', ['tutorial-r2'], ['tutorial-f1', 'tutorial-f2'])],
  gaps: [advice('补充一次“为什么选择这个方案”的取舍说明', '把备选方案、约束和验证方式讲清楚。')],
  companyResearch: [advice('梳理新成员创建任务时最容易困惑的环节', '结合公司业务场景，准备具体问题和验证思路。', ['tutorial-d1'], [], ['tutorial-source'])],
};
const tasks: Task[] = [
  { id: 'tutorial-task-1', text: '整理报名流程项目的访谈、原型和测试材料', jobIds: [job.id], done: false, order: 0, createdAt: date },
  { id: 'tutorial-task-2', text: '练习说明一次设计取舍与验证方法', jobIds: [job.id], done: false, order: 1, createdAt: date },
];
export const tutorialCase = { job, project, sources, company, recommendations, preparation, tasks };

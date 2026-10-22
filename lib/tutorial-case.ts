import type { Advice, CompanyResult, Job, PreparationResult, Project, RecommendationResult, Source, Task } from './database';
import { roleInputVersion } from './role-taxonomy';
import type { PracticeExample } from './exercises';

// Presentation-only fixtures. These objects never belong to an account workspace.
const date = '2026-10-22T00:00:00.000Z';
const responsibilities = ['梳理团队创建、分配和跟进任务的核心流程，设计易用的交互方案。', '通过用户访谈和可用性测试发现问题，与产品和研发协作推进改进。'];
const requirements = ['能够用流程图、原型表达方案，并解释设计取舍。', '具备用户研究和可用性测试能力，能结合反馈验证方案。'];
const job: Job = {
  id: 'tutorial-job', title: '交互设计师（协作产品）', company: '星桥协作', location: '上海', direction: '协作产品体验', hiringType: '校招',
  content: `星桥协作｜交互设计师（协作产品）\n校园招聘 · 上海\n岗位职责：\n${responsibilities.join('\n')}\n任职要求：\n${requirements.join('\n')}`,
  sourceType: 'link', sourceUrl: 'https://careers.example.com/experience-design', responsibilities: responsibilities.map((text, index) => ({ id: `tutorial-d${index + 1}`, text, sourceText: text })),
  requirements: requirements.map((text, index) => ({ id: `tutorial-r${index + 1}`, text, sourceText: text })),
  status: '准备投递', nextAction: '整理一个从发现问题到验证方案的完整案例', createdAt: date, updatedAt: date,
};
job.classification = { categoryId: 'experience_design', confidence: 'high', reason: 'JD以交互方案设计和可用性测试为主，归为用户体验设计。', evidence: responsibilities, inputVersion: roleInputVersion(job), classifiedAt: date };
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
  businesses: [advice('提供任务分配和项目进度管理工具', '主要供小型团队的项目负责人和成员使用。', [], [], ['tutorial-source'])],
  roleInsights: [advice('优化新成员创建任务的操作流程', '需要通过访谈和可用性测试找出操作中的问题。', ['tutorial-d1', 'tutorial-r2'], [], ['tutorial-source'])],
  hypotheses: [advice('负责人和普通成员是否有不同的操作习惯？', '现有资料未说明，可向面试官确认。', ['tutorial-r2'], [], ['tutorial-source'])],
  questions: [advice('目前用什么方式判断创建任务的流程是否好用？', '了解团队怎样做用户研究、如何评估改进效果。', ['tutorial-r2'], [], ['tutorial-source'])],
};
const recommendations: RecommendationResult = { recommendations: [{
  projectId: project.id, rank: 1, role: 'primary', matchType: 'transferable', requirementIds: ['tutorial-r1', 'tutorial-r2'], factIds: ['tutorial-f1', 'tutorial-f2'],
  reason: '这个项目也关注入口位置和操作流程，使用了岗位要求的访谈、原型设计和可用性测试。',
  resumeBullets: [{ text: '访谈报名同学，梳理活动报名流程，设计并测试交互原型，提出入口和表单说明的改进建议。', factIds: ['tutorial-f1', 'tutorial-f2'] }],
  interviewOutline: [{ text: '说明报名时遇到的问题、访谈发现、方案选择和测试结果，再谈如何改进新成员创建任务的流程。', factIds: ['tutorial-f1', 'tutorial-f2'] }],
}], gaps: [], needsReview: [] };
const preparation: PreparationResult = {
  priorities: [advice('准备报名流程项目的完整介绍', '按发现问题、选择方案、验证结果的顺序讲清楚。', ['tutorial-r1', 'tutorial-r2'])],
  strengths: [advice('介绍访谈发现如何影响报名流程的设计', '讲清楚你负责的访谈、原型设计和测试工作。', ['tutorial-r2'], ['tutorial-f1', 'tutorial-f2'])],
  gaps: [advice('补充一个方案选择的例子', '说明备选方案、选择理由，以及用什么方式验证。')],
  companyResearch: [advice('准备几个关于创建任务流程的问题', '面试时了解现有流程、常见问题和改进目标。', ['tutorial-d1'], [], ['tutorial-source'])],
};
const tasks: Task[] = [
  { id: 'tutorial-task-1', text: '整理报名流程项目的访谈、原型和测试材料', jobIds: [job.id], done: false, order: 0, createdAt: date },
  { id: 'tutorial-task-2', text: '练习说明一次设计取舍与验证方法', jobIds: [job.id], done: false, order: 1, createdAt: date },
];
const practice: PracticeExample = {
  exercise: {
    id: 'tutorial-exercise', direction: '用户体验设计',
    background: '星桥协作希望改善新成员首次创建任务的流程。本轮先做小范围测试，需要明确用户卡在哪里，再决定修改哪些内容。',
    question: '请介绍一个项目：你发现了什么问题、为什么选这个方案、如何验证效果？',
    dimensions: ['用户问题', '方案选择', '验证方法'], followupDirections: ['方案选择的依据', '测试任务与观察内容'],
    nodes: [
      { title: '明确创建任务时的问题', colleague: '产品经理', situation: '新成员经常找不到创建任务的入口。你能先列一下需要确认的问题，再给个测试方案吗？', choices: ['先观察新成员第一次创建任务，记录入口查找和表单理解上的问题', '先整理现有反馈，再和产品经理确认本轮优先验证的操作', '先比较两个入口方案，用原型测试确认哪个更容易被找到'], change: '交付要求：需要确认的问题、测试任务和本轮改动范围。' },
      { title: '讨论原型测试结果', colleague: '设计负责人', situation: '测试中有同学找到了入口，但仍不理解“负责人”字段。下一轮只能调整一处，你建议先改哪里，怎么验证？', choices: ['先调整字段说明，再让新成员独立完成创建任务，记录理解和填写过程', '先比较两个字段说明方案，记录错误和需要求助的地方', '先复核入口与字段问题各自影响了哪些用户，再确定修改顺序'], change: '交付要求：选择理由、验证方式和需要进一步确认的内容。' },
    ],
  },
  answer: '在校园活动报名项目中，我访谈了参与报名的同学，发现入口位置和表单说明影响了填写。我梳理了操作流程，设计交互原型，再通过任务测试观察同学能否独立完成报名，整理出需要修改的入口和说明。',
  supplement: '我会先比较不同入口位置和说明方式，再让同学独立完成报名任务，记录卡住的位置、错误和求助情况。课程项目完成了原型测试，没有上线数据，后续效果还需要继续验证。',
  followup: '你为什么选择这个入口方案？测试时观察哪些现象，才能判断问题是否改善？',
  colleagueReply: '现有反馈主要提到入口不好找和字段说明不清楚。还没有完整的操作记录，本轮可以先观察新成员完成一次创建任务，再确定改动范围。',
  responses: [
    { dialogue: '可以，先把测试任务和需要观察的内容列出来。测试后一起确认问题，暂时先不扩大改动范围。', consequence: '本轮先观察新成员创建任务，具体改哪里要等测试后再定。' },
    { dialogue: '把这轮的选择理由和验证方式写清楚，再确认测试时间。结果出来后，我们一起决定是否继续调整。', consequence: '下一轮需要验证改动是否有帮助，并记录操作中出现的问题。' },
  ],
  feedback: {
    strengths: ['能结合项目说明访谈、流程梳理和原型测试的做法。'],
    dimensions: [{ name: '用户问题', feedback: '示例先说明入口与表单问题，再介绍自己的研究和设计工作，内容与JD要求相符。', requirementIds: ['tutorial-r2'] }, { name: '方案选择', feedback: '还可补充备选方案和选择理由，让面试官了解具体判断过程。', requirementIds: ['tutorial-r1'] }],
    improvements: ['补充一个具体的方案选择例子，并说明测试中观察了什么。'],
    outline: ['说明用户遇到的问题', '介绍本人负责的访谈、流程和原型工作', '解释备选方案与选择理由', '说明测试结果及尚未验证的部分'],
    nextActions: ['补充一个方案选择的例子'],
  },
  scenarioFeedback: {
    strengths: ['能先了解已有反馈，再讨论测试任务和改动范围。'],
    dimensions: [{ name: '问题确认', feedback: '先观察新成员怎样操作，可以区分入口查找和字段理解上的问题。', requirementIds: ['tutorial-r2'] }, { name: '改动与验证', feedback: '提出改动时，还需说明具体改哪里，以及测试中要记录什么。', requirementIds: ['tutorial-r1'] }],
    improvements: ['把测试任务、观察项和判断标准写清楚，方便同事一起准备。'],
    outline: ['整理已有反馈和待确认问题', '让新成员独立完成创建任务', '记录卡住的位置、错误和求助情况', '根据测试记录讨论修改范围'],
    nextActions: ['列出创建任务流程的测试任务和观察项'],
  },
};
export const tutorialCase = { job, project, sources, company, recommendations, preparation, tasks, practice };

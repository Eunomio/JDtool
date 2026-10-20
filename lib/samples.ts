import type { Job, Project, Source } from './database';

const items = [
  { id: 'huawei-hf', company: '华为', title: '人因与用户体验工程师', hiringType: '实习', direction: '人因研究', url: 'https://career.huawei.com/cn/job-details?advertisementId=30851&lang=zh_CN', responsibilities: ['开展实验与用户洞察研究', '开展软硬件体验评价与体验标准建设'], requirements: [], note: '岗位截图所示人因研究方向摘要；具体团队、产品对象及完整任职要求待确认。' },
  { id: 'vivo-hf', company: 'vivo', title: '人因研究工程师', hiringType: '实习', direction: '人因研究', url: 'https://hr-campus.vivo.com/intern/detail?jobAdId=dc420b3e-a692-49b7-a3b2-069fa4554ab9', responsibilities: ['面向手机、智能穿戴等产品开展人因研究', '分析用户需求与使用习惯，参与前瞻产品规划与定义'], requirements: ['具备实验设计、程序开发和统计分析能力', '眼动、脑电或编程经验为加分项'], note: '中央研究院，具体业务项目待确认。' },
  { id: 'nio-hf', company: '蔚来', title: '人机工程师', hiringType: '校招', direction: '人因研究', url: 'https://nio.jobs.feishu.cn/campus/position/7687530409973795098/detail', responsibilities: ['建立用户感受与整车工程参数的量化关系', '评估空间、视野、操作、储物等体验，开展虚拟仿真与实车测评', '将研究成果沉淀为标准规范'], requirements: ['具备统计分析能力', '仿真软件经验为加分项'], note: '具体车型与项目待确认。' },
  { id: 'nio-pm', company: '蔚来', title: '产品经理', hiringType: '校招', direction: '产品经理', url: 'https://nio.jobs.feishu.cn/campus/position/7673027238186862886/detail', responsibilities: ['面向桩端、能源硬件及充电管理系统开展产品工作', '开展需求管理、用户调研、技术方案评审与数据分析', '探索AI能力在充电产品中的应用'], requirements: ['理解电力电子知识', '具备需求分析与跨团队沟通能力'], note: '具体产品项目待确认。' },
  { id: 'bytedance-pm', company: '字节跳动', title: 'AI产品经理（豆包大模型方向）', hiringType: '校招', direction: '产品经理', url: 'https://jobs.bytedance.com/campus/position/7667576106895689989/detail?spread=5YNTDRM', responsibilities: ['面向火山方舟MaaS平台开展产品工作', '涉及模型推理、精调工作流、RAG、Tools与Agent框架', '推进企业客户落地与效果评估'], requirements: ['理解LLM技术路径', '理解开发者工具产品'], note: '具体团队项目待确认。' },
  { id: 'iflytek-pm', company: '科大讯飞', title: '产品经理', hiringType: '校招', direction: '产品经理', url: 'https://iflytek.zhiye.com/campus/detail?jobAdId=ed343410-6036-4902-b8cf-3b11b8416142', responsibilities: ['发现和分析需求，提供产品解决方案', '持续分析产品数据，协同技术与运营推进产品升级', '开展行业及竞品研究'], requirements: ['具备用户需求洞察和商业敏感度', '具备逻辑分析和沟通协作能力'], note: '集团统一招聘，JD未指定具体产品线。' },
];

export function sampleJobs(): Job[] {
  const now = new Date().toISOString();
  return items.map((item) => ({ id: `sample-${item.id}`, title: item.title, company: item.company, content: `${item.company} · ${item.title}\n${item.hiringType}\n岗位职责：\n${item.responsibilities.join('\n')}\n任职要求：\n${item.requirements.join('\n')}\n${item.note}`, sourceUrl: item.url, sourceType: 'text', direction: item.direction, hiringType: item.hiringType, sample: true, status: '关注中', nextAction: '', createdAt: now, updatedAt: now, responsibilities: item.responsibilities.map((text, index) => ({ id: `${item.id}-d${index}`, text, sourceText: text })), requirements: item.requirements.map((text, index) => ({ id: `${item.id}-r${index}`, text, sourceText: text })), warnings: ['示例依据已核对的岗位摘要整理，最新内容请查看招聘原页。'] }));
}

export function sampleSources(): Source[] {
  return items.map((item) => ({ id: `source-${item.id}`, jobId: `sample-${item.id}`, label: `${item.company}招聘资料`, url: item.url, text: `${item.responsibilities.join('；')}。${item.note}`, collectedAt: '2026-10-20T00:00:00.000Z' }));
}

export function sampleProjects(): Project[] {
  return [
    { name: '专业桌面软件升级项目', stage: '已上线', role: '产品需求与设计协作', industry: '专业桌面软件', facts: ['在PC端专业软件重构中整理和优化需求', '产出软件原型', '协调开发与上线工作'] },
    { name: '智能出行人因研究项目', stage: '构思/进行中', role: '研究设计与数据采集', industry: '智能电动汽车与模拟驾驶', facts: ['设计模拟驾驶实验，研究用户状态和自适应交互', '采集脑电、眼动、行为和主观评价数据', '项目仍在进行中'] },
    { name: '智能对话体验评价项目', stage: '构思/进行中', role: '体验评价研究', industry: '车载对话', facts: ['构建智能对话体验评价框架', '整理对话样本并开展LLM评估流程'] },
    { name: 'AI辅助训练产品原型', stage: '原型', role: '产品原型设计', industry: 'AI辅助训练', facts: ['设计情景复盘、社交模拟、成长记录和报告等产品流程', '制作可运行产品演示'] },
    { name: '健康记录交互设计项目', stage: '原型', role: '交互设计课程小组成员', industry: '健康记录', facts: ['在交互设计课程小组作业中开展调研与访谈', '完成多轮界面迭代'] },
  ].map((item, index) => ({ id: `sample-p${index + 1}`, name: item.name, type: item.industry, stage: item.stage, timeline: '', role: item.role, problem: '', actions: item.facts.join('；'), methods: '', results: '', skills: [], facts: item.facts.map((text, factIndex) => ({ id: `sample-p${index + 1}-f${factIndex + 1}`, text, sourceText: text, category: '已核对样本' })), sources: [{ id: `sample-portfolio-${index + 1}`, label: '经授权的脱敏项目摘要', url: 'https://github.com/Eunomio/portfolio', text: item.facts.join('\n'), collectedAt: '2026-10-20T00:00:00.000Z' }], confirmed: true, sample: true, visibility: 'display', redactions: [], updatedAt: new Date().toISOString() }));
}

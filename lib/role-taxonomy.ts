export const roleCategories = [
  { id: 'experience_design', name: '用户体验设计', family: '设计与研究', description: '交互流程、信息架构、可用性与体验方案' },
  { id: 'visual_design', name: '视觉与界面设计', family: '设计与研究', description: '界面视觉、品牌表现与设计规范' },
  { id: 'user_research', name: '用户研究与人因', family: '设计与研究', description: '用户研究、实验设计、行为分析与人因验证' },
  { id: 'industrial_design', name: '工业与产品造型设计', family: '设计与研究', description: '实体产品形态、结构体验与材料工艺' },
  { id: 'product_management', name: '产品管理', family: '产品与业务', description: '需求决策、产品规划与业务目标' },
  { id: 'project_management', name: '项目与交付管理', family: '产品与业务', description: '项目计划、跨团队推进与客户交付' },
  { id: 'frontend_engineering', name: '前端开发', family: '研发与工程', description: '网页界面、交互实现与前端工程' },
  { id: 'backend_engineering', name: '后端开发', family: '研发与工程', description: '服务端、接口、数据库与系统设计' },
  { id: 'fullstack_engineering', name: '全栈开发', family: '研发与工程', description: '同时负责前端与后端的完整应用开发' },
  { id: 'mobile_engineering', name: '移动端开发', family: '研发与工程', description: 'iOS、Android与跨平台客户端' },
  { id: 'qa_engineering', name: '测试与质量', family: '研发与工程', description: '测试设计、自动化测试与质量保障' },
  { id: 'infrastructure', name: '基础设施与运维', family: '研发与工程', description: '平台、云服务、可靠性与系统运维' },
  { id: 'hardware_engineering', name: '硬件与嵌入式', family: '研发与工程', description: '硬件电路、固件、嵌入式与电子系统' },
  { id: 'data_analytics', name: '数据分析', family: '数据与智能', description: '指标分析、统计建模与业务洞察' },
  { id: 'data_engineering', name: '数据开发', family: '数据与智能', description: '数据管道、数仓与数据平台建设' },
  { id: 'ai_algorithm', name: '算法与人工智能', family: '数据与智能', description: '算法研究、模型训练与智能系统' },
  { id: 'product_operations', name: '产品与用户运营', family: '运营与增长', description: '用户运营、产品运营与增长实验' },
  { id: 'content_operations', name: '内容与社区运营', family: '运营与增长', description: '内容策划、社区维护与传播' },
  { id: 'marketing', name: '市场与品牌', family: '运营与增长', description: '品牌营销、渠道投放与市场活动' },
  { id: 'sales', name: '销售与商务', family: '商业与职能', description: '客户拓展、商务合作与销售服务' },
  { id: 'business_functions', name: '企业职能', family: '商业与职能', description: '人力、财务、法务与行政支持' },
  { id: 'other', name: '其他专业岗位', family: '其他', description: '职责明确，暂未涵盖的专业领域' },
  { id: 'undetermined', name: '待确认类别', family: '待确认', description: 'JD信息不足或职责边界尚需确认' },
] as const;

export type RoleCategoryId = typeof roleCategories[number]['id'];
export type RoleClassification = { categoryId: RoleCategoryId; confidence: 'high' | 'medium' | 'low'; reason: string; evidence: string[]; inputVersion: string; classifiedAt: string };
type RoleInput = { title: string; content: string; responsibilities?: { text: string }[]; requirements?: { text: string }[] };

export function roleInputVersion(job: RoleInput) {
  const value = JSON.stringify([job.title, job.content, job.responsibilities?.map(row => row.text) || [], job.requirements?.map(row => row.text) || []]);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

export function categoryFor(job: RoleInput & { classification?: RoleClassification; categoryOverride?: RoleCategoryId }) {
  const current = job.classification && job.classification.inputVersion === roleInputVersion(job);
  const id = job.categoryOverride || (current && job.classification!.confidence !== 'low' ? job.classification!.categoryId : 'undetermined');
  return roleCategories.find(category => category.id === id) || roleCategories[roleCategories.length - 1];
}

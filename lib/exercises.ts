import type { Job } from './database';

export type Exercise = { id: string; direction: string; background: string; question: string; dimensions: string[]; followupDirections: string[]; nodes: { title: string; situation: string; colleague: string; choices: string[]; change: string }[] };

export function exerciseFor(job: Job): Exercise {
  const research = /人因|人机|研究|实验|测量/.test(`${job.title} ${job.direction}`);
  const company = job.company || '目标公司';
  const product = /vivo/i.test(company) ? '智能穿戴设备' : /蔚来/.test(company) && research ? '整车座舱' : /华为/.test(company) && research ? '智能终端' : research ? 'JD涉及的产品' : /蔚来/.test(company) ? '充电管理产品' : /字节/.test(company) ? '面向开发者的大模型平台' : '一项面向用户的产品功能';
  if (research) return {
    id: 'research-experiment', direction: '研究与体验评价',
    background: `练习任务：评估${product}长时间使用的舒适性。现有用户评价存在分歧，本轮只能开展小规模测试。你需要提交一页研究方案，说明测什么、怎么测，以及结果如何支持设计调整。`,
    question: `请围绕${product}的使用舒适性设计一项研究。说明研究问题与假设、实验条件、参与者、任务、主客观测量指标、流程、干扰因素和分析思路，并解释在时间有限时如何取舍。`,
    dimensions: ['研究问题与假设', '实验条件与参与者', '任务和测量指标', '干扰因素与分析', '研究沟通与可执行性'],
    followupDirections: ['变量与指标的一致性', '样本与实验顺序', '主客观结果不一致的解释'],
    nodes: [
      { title: '提交首轮研究方案', colleague: '设计同事', situation: '这轮只能安排一次测试。请确定参与者、测试任务和测量指标，我需要据此准备样机与排期。', choices: ['围绕一个关键假设设计控制条件，结合主客观测量；减少测试条件，优先验证主要差异', '先访谈目标用户并记录具体不适场景，再把高频问题转成下一轮实验条件', '先复用现有测试流程做一轮探索，保留个体记录，并注明样本和任务覆盖的限制'], change: '交付要求：一页方案，包括研究问题、测试流程、保留的指标和本轮无法回答的问题。' },
      { title: '汇总结果与设计建议', colleague: '设计负责人', situation: '练习结果：部分参与者主观舒适度偏低，客观测量未发现相同趋势。请说明当前能支持哪些判断，以及下一轮如何验证。', choices: ['先复核测量与任务条件，再按个体差异分析不一致结果，提交需补充验证的清单', '先根据主观反馈整理可逆的设计调整，安排小范围复测，同时保留客观测量', '本轮先汇报分歧与结论范围，在补充使用场景记录后再建议是否调整设计'], change: '交付要求：简要说明已有证据、结论范围、优先验证的事项和所需协作。' },
    ],
  };
  return {
    id: 'product-priorities', direction: '需求判断与产品推进',
    background: `练习任务：排查${product}使用率下降的问题。运营转来两类用户反馈，本轮技术资源只能支持一项改动。你需要明确优先解决的问题，提交改动建议和效果验证计划。`,
    question: `面对${product}使用率下降和两类新需求，你会如何核查数据、定位用户问题、明确业务目标、排列需求优先级，并制定改进效果的验证计划？请说明约束和跨团队沟通方式。`,
    dimensions: ['用户问题与需求判断', '数据口径与分群', '业务目标与约束', '优先级与取舍', '验证计划与协作'],
    followupDirections: ['指标口径和用户分群', '需求排序的证据', '验证周期与成功标准'],
    nodes: [
      { title: '核对问题与已有证据', colleague: '运营同事', situation: '目前收到两类反馈，但还没核对它们与使用率变化的关系。请告诉我你优先需要哪些数据或用户信息，我来协调。', choices: ['先核对指标口径、时间与用户分群，再按影响范围补充反馈，形成问题清单', '先访谈流失用户并整理使用障碍，同时请数据同事核查异常时间段', '先检查最近版本与运营活动的变化，排除统计和流程问题后再安排需求访谈'], change: '资源限制：本轮只能支持一项改动；需要明确这次核查的范围与交付时间。' },
      { title: '确定改动范围与验证计划', colleague: '技术负责人', situation: '这轮可以处理一项需求。请说明你建议先解决什么、需要多少协作，以及完成后如何判断是否有效。', choices: ['优先处理证据最充分且影响范围大的问题，小范围发布并对比关键指标', '先做成本较低的可逆改动，缩短验证周期；若结果不足再投入完整方案', '先用人工流程验证需求价值，确认有效后再安排开发，接受较慢的推广速度'], change: '交付要求：优先级理由、最小改动范围、验证指标、协作人及调整方案的条件。' },
    ],
  };
}

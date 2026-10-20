import type { Job } from './database';

export type Exercise = { id: string; direction: string; background: string; question: string; dimensions: string[]; followupDirections: string[]; nodes: { title: string; situation: string; colleague: string; choices: string[]; change: string }[] };

export function exerciseFor(job: Job): Exercise {
  const research = /人因|人机|研究|实验|测量/.test(`${job.title} ${job.direction}`);
  const company = job.company || '目标公司';
  const product = /vivo/i.test(company) ? '智能穿戴设备' : /蔚来/.test(company) && research ? '整车座舱' : /华为/.test(company) && research ? '智能终端' : research ? 'JD涉及的产品' : /蔚来/.test(company) ? '充电管理产品' : /字节/.test(company) ? '面向开发者的大模型平台' : '一项面向用户的产品功能';
  if (research) return {
    id: 'research-experiment', direction: '研究与体验评价',
    background: `${company}的模拟工作情境：设计团队收到${product}在长时间使用后的舒适性反馈，不同用户的评价存在分歧。团队希望在时间与样本有限的情况下，获得可以用于下一轮设计的研究建议。`,
    question: `请围绕${product}的使用舒适性设计一项研究。说明研究问题与假设、实验条件、参与者、任务、主客观测量指标、流程、干扰因素和分析思路，并解释在时间有限时如何取舍。`,
    dimensions: ['研究问题与假设', '实验条件与参与者', '任务和测量指标', '干扰因素与分析', '研究沟通与可执行性'],
    followupDirections: ['变量与指标的一致性', '样本与实验顺序', '主客观结果不一致的解释'],
    nodes: [
      { title: '设计一项能回答问题的研究', colleague: '设计同事', situation: '团队只能先做一轮小规模研究。你需要确定研究条件、参与者、任务和测量，向设计同事说明你希望得到什么证据。', choices: ['先明确舒适性问题和假设，控制条件后结合主客观指标设计小样本研究', '先发舒适性问卷，收集尽可能多的主观评价', '先找几位同事试用，直接选出大家更喜欢的方案'], change: '新限制：设计团队只能配合有限的测试时间，你需要说明优先保留哪些条件与测量。' },
      { title: '解释分歧并给出下一步建议', colleague: '设计负责人', situation: '模拟结果中，有些参与者的主观舒适度较低，但现有客观测量没有出现同样趋势。负责人希望据此马上确定调整方案。', choices: ['复核测量、任务与个体差异，说明当前结论和需补充验证的内容', '只依据主观舒适度立即决定设计调整', '只相信客观测量，认定当前设计没有问题'], change: '负责人需要一份简短汇报：已发现什么、暂时无法确认什么，以及下一轮最值得验证什么。' },
    ],
  };
  return {
    id: 'product-priorities', direction: '需求判断与产品推进',
    background: `${company}的模拟工作情境：${product}的使用率近期下降，运营同时转来两类用户反馈。技术与运营资源有限，需要你判断先处理什么，以及怎样验证判断。`,
    question: `面对${product}使用率下降和两类新需求，你会如何核查数据、定位用户问题、明确业务目标、排列需求优先级，并制定改进效果的验证计划？请说明约束和跨团队沟通方式。`,
    dimensions: ['用户问题与需求判断', '数据口径与分群', '业务目标与约束', '优先级与取舍', '验证计划与协作'],
    followupDirections: ['指标口径和用户分群', '需求排序的证据', '验证周期与成功标准'],
    nodes: [
      { title: '弄清使用率下降的原因', colleague: '运营同事', situation: '运营希望尽快上线一个新功能，你需要先判断使用率变化意味着什么，并向运营获取关键线索。', choices: ['先核对指标口径、时间与用户分群，再结合反馈判断问题', '直接把新需求交给技术团队排期', '只关注提出需求最多的用户，立即调整功能'], change: '新限制：技术团队本轮只能支持一项改动，运营还需要处理既有活动。' },
      { title: '确定优先级并说明验证方式', colleague: '技术负责人', situation: '团队需要在改善既有使用问题和增加新功能之间安排本轮工作。你需要用现有依据说明取舍，并提出可执行的验证计划。', choices: ['按用户影响、业务目标、证据强弱和成本排序，安排小范围验证', '把两项需求都列为最高优先级，要求团队同时完成', '先做最容易开发的一项，暂时不设验证指标'], change: '负责人希望知道：这轮先解决谁的什么问题，什么结果说明值得继续投入，以及结果不符预期时如何调整。' },
    ],
  };
}

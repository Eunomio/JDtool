import { practiceSources } from './practice-context';

export function companySources<T extends { text: string }>(job: Parameters<typeof practiceSources>[0] & { company: string }, sources: T[]) {
  // Keep the complete pages in storage; send relevant, verbatim excerpts for analysis.
  return practiceSources({ ...job, title: `${job.company} ${job.title} 主营业务 产品 服务 客户` }, sources, 12000);
}

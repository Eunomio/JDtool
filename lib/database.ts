import Dexie, { type Table } from 'dexie';

export const statuses = ['关注中', '准备投递', '已投递', '笔试/测评', '面试中', '已获Offer', '已结束'] as const;
export type JobStatus = typeof statuses[number];
export type Job = {
  id: string;
  title: string;
  company: string;
  content: string;
  status: JobStatus;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
};

class JobDatabase extends Dexie {
  jobs!: Table<Job, string>;

  constructor() {
    super('jdtool');
    this.version(1).stores({ jobs: 'id, status, updatedAt' });
  }
}

export const database = new JobDatabase();

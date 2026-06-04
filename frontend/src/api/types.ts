export type TaskStatus =
  | 'DRAFT'
  | 'SYNCING'
  | 'PENDING_CONFIRM'
  | 'PROCESSING'
  | 'READY_STRESS'
  | 'STRESSING'
  | 'COMPLETED'
  | 'ARCHIVED';

export interface StressTask {
  id: number;
  taskCode: string;
  taskName: string;
  reportPeriodStart: string;
  reportPeriodEnd: string;
  dataCaliber?: string;
  description?: string;
  status: TaskStatus;
  createdAt: string;
}

export interface CompanyFinancialRecord {
  id: number;
  taskId: number;
  companyCode: string;
  companyName: string;
  branchName?: string;
  apiIndustry?: string;
  standardIndustry?: string;
  dataAvailability: 'USABLE' | 'NEED_AVG' | 'ABNORMAL';
  availabilityReason?: string;
  dataSource?: string;
  confirmed: boolean;
  included: boolean;
}

export interface StressResult {
  id: number;
  taskId: number;
  companyCode: string;
  companyName: string;
  branchName?: string;
  standardIndustry?: string;
  scenarioCode: string;
  scenarioName: string;
  metricRevenueBefore?: number;
  metricRevenueAfter?: number;
  metricEclBefore?: number;
  metricEclAfter?: number;
  impactRate?: number;
}

export interface IndustryMapping {
  id: number;
  apiIndustry: string;
  standardIndustry: string;
  status: string;
}

export interface StressFactor {
  id: number;
  factorCode: string;
  factorName: string;
  industry?: string;
  scenarioType?: string;
  factorValue: number;
  unit?: string;
  status: string;
}

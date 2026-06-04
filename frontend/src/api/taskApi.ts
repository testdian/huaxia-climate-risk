import client from './client';
import type { CompanyFinancialRecord, StressResult, StressTask } from './types';

export const taskApi = {
  list: () => client.get<StressTask[]>('/tasks'),
  get: (id: number) => client.get<StressTask>(`/tasks/${id}`),
  create: (data: Partial<StressTask>) => client.post<StressTask>('/tasks', data),
  sync: (id: number) => client.post(`/tasks/${id}/sync`),
  records: (id: number) => client.get<CompanyFinancialRecord[]>(`/tasks/${id}/records`),
  confirmRecords: (id: number, payload: { recordIds: number[]; action: string }) =>
    client.post(`/tasks/${id}/records/confirm`, payload),
  calcIndustryAvg: (id: number) => client.post(`/tasks/${id}/calc-industry-avg`),
  runStress: (id: number, scenarios: string[]) =>
    client.post(`/tasks/${id}/stress`, { scenarios }),
  results: (id: number) => client.get<StressResult[]>(`/tasks/${id}/results`),
  summary: (id: number, dimension: 'industry' | 'branch') =>
    client.get(`/tasks/${id}/summary`, { params: { dimension } }),
};

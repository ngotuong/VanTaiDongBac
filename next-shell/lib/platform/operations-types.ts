import type { AppRole } from './types';

export type AccountUser = {
  user_id: string;
  username: string;
  display_name: string;
  role: AppRole;
  active: boolean;
};

export type SyncStatusRow = {
  syncKey?: string;
  module?: string;
  status?: string;
  message?: string;
  syncedAt?: string;
  ageSeconds?: number | null;
};

export type WriteJob = {
  jobId?: string;
  action?: string;
  status?: string;
  lastError?: string;
  createdAt?: string;
  updatedAt?: string;
  attempts?: number;
  maxAttempts?: number;
  payload?: Record<string, unknown>;
};

export type ManageAuditRow = {
  sheetName?: string;
  ok?: boolean;
  status?: string;
  message?: string;
  syncedAt?: string;
};

export type ReportAuditRow = {
  month?: string;
  ok?: boolean;
  status?: string;
  message?: string;
  syncedAt?: string;
};

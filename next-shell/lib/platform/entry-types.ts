export type EntryFormType = 'vanChuyen'|'taiXe'|'dau'|'chamCong'|'phat'|'nghiVanHanh';
export type EntryRow = Record<string,string>;
export type EntryCatalogs = Record<string, unknown> & {
  vehicles?: Array<{plate?:string;owner?:string}>; activeVehicles?: Array<{plate?:string;owner?:string}>;
  people?: Array<{name?:string;role?:string}>; activePeople?: Array<{name?:string;role?:string}>; activeDrivers?: Array<{name?:string}>;
  projects?: Array<{name?:string}>; activePenalties?: Array<{code?:string;content?:string}>;
  operationGroups?: Array<{name?:string}>;
  fuelSources?: string[]; fuelPaymentSources?: string[]; chamCongTypes?: Array<{name?:string}>; nghiVanHanhTypes?: string[];
  supabaseCached?: boolean; supabaseSyncedAt?: string; updatedAt?: string;
};
export type WriteJob = { ok?:boolean; queued?:boolean; jobId:string; action?:string; status:'pending'|'processing'|'synced'|'failed'; lastError?:string; result?:unknown };

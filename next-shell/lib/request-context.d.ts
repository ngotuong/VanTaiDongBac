import type { PlatformContext, WorkbookContext, WorkbookModule } from './platform/types';

export function loadPlatformContext(input?: { module?: WorkbookModule; year?: string }): Promise<PlatformContext>;
export function loadServerWorkbookContext(input?: { module?: WorkbookModule; year?: unknown }): Promise<WorkbookContext & { spreadsheetId: string }>;

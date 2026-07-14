import type { PlatformContext, WorkbookModule } from './platform/types';

export function loadPlatformContext(input?: { module?: WorkbookModule; year?: string }): Promise<PlatformContext>;

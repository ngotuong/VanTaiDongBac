'use client';

import { createContext, useContext, useMemo } from 'react';
import type { PlatformContext } from '../../lib/platform/types';

const WorkbookContext = createContext<PlatformContext | null>(null);

export function WorkbookContextProvider({ value, children }: { value: PlatformContext; children: React.ReactNode }) {
  const stableValue = useMemo(() => value, [value]);
  return <WorkbookContext.Provider value={stableValue}>{children}</WorkbookContext.Provider>;
}

export function useWorkbookContext() {
  const value = useContext(WorkbookContext);
  if (!value) throw new Error('useWorkbookContext must be used inside WorkbookContextProvider.');
  return value;
}

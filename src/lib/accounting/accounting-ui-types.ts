// Shared types used by the accounting UI primitives in
// `src/components/accounting/accounting-ui.tsx` (metric cards, tables, etc.).
//
// History: these types used to live alongside a large pile of UI-first-phase
// mock data in `mock-data.ts`. The mock data is gone; only the types remain.

import type { ReactNode } from "react";

export type AccountingMetric = {
  label: string;
  value: string;
  detail: string;
};

export type TableColumn = {
  key: string;
  label: string;
};

export type TableRow = Record<string, string | ReactNode>;

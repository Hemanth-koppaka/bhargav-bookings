// Change history kept on each booking (who moved/cancelled it, when, from where).
export type HistoryEntry = {
  at: string;
  by: string;
  action: string;
  from?: unknown;
  to?: unknown;
  reason?: string;
};

export const withHistory = (row: unknown, entry: Omit<HistoryEntry, "at">): HistoryEntry[] => [
  ...(((row as { history?: HistoryEntry[] } | null)?.history ?? []) as HistoryEntry[]),
  { at: new Date().toISOString(), ...entry },
];

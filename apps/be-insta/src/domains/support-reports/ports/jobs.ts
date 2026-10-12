export type Jobs = Readonly<{
  publish: (reportId: string) => Promise<void>;
  next: () => Promise<Readonly<{ reportId: string; id: string }> | null>;
  acknowledge: (id: string) => Promise<void>;
}>;

import type { Socket } from "node:net";
export type EgressConnection = () => Socket;
export type BudgetObservation = Readonly<{
  address: string;
  generation: string;
  config: Readonly<{ authLimitsKey: string }>;
  read: (key: string) => Promise<string | null>;
}>;
export type Egress = Readonly<{
  server: string;
  address: string;
  runId: string;
  observe: (address?: string) => Promise<number>;
  dispose: () => Promise<void>;
}>;

import type { createBffEnvironment } from "../environment";
export type FaultFixture = Awaited<ReturnType<typeof createBffEnvironment>>;
export type FaultState = {
  nativeDown: boolean;
  failIntent: boolean;
  refreshMode: "normal" | "held-invalid" | "unknown";
  released: boolean;
  entered: boolean;
  clockOverride?: number;
  readonly refreshKeys: string[];
};

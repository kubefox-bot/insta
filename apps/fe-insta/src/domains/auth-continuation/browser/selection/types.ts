import type { Recovery, RecoveryView } from "../../ports/recovery/types";
export type SelectionInput = Readonly<{
  recovery: RecoveryView;
  projectedIntent?: string | null;
  cancelled: boolean;
  dismissedIntent: string | null;
}>;
export type SelectionDependencies = Pick<Recovery, "cancel">;

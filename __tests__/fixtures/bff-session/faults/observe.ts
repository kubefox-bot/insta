import type { Binding } from "../../../../apps/fe-insta/src/lib/session/server/types";
import type { FaultFixture, FaultState } from "./types";
export const observeFaultBinding = async ({
  fixture,
  state,
  binding,
}: {
  readonly fixture: FaultFixture;
  readonly state: FaultState;
  readonly binding: Binding;
}) => ({
  blocked: binding.blocked,
  revision: binding.revision,
  pending: !!binding.revocation,
  confirmed: binding.revocationConfirmed === true,
  attemptKey: binding.attempt?.key,
  recoverUntil: binding.attempt?.recoverUntil,
  leaseGeneration: binding.attempt?.leaseGeneration,
  entered: state.entered,
  refreshKeys: [...state.refreshKeys],
  nativeState: (
    await fixture.native.db
      .collection("users_sessions")
      .findOne({ backendSessionId: binding.backendSessionId })
  )?.state,
  canonicalLogouts: await fixture.native.db
    .collection("users_outbox")
    .countDocuments({
      backendSessionId: binding.backendSessionId,
      type: "logout_completed",
    }),
});

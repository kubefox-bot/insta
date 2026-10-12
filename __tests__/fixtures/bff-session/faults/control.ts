import { z } from "zod";
import type { SessionDependencies } from "../../../../apps/fe-insta/src/lib/session/server/index";
import type { Binding } from "../../../../apps/fe-insta/src/lib/session/server/types";
import { expireOwnedAccess } from "./expire";
import { observeFaultBinding } from "./observe";
import type { FaultFixture, FaultState } from "./types";

const actionSchema = z.object({
  action: z.enum([
    "inspect",
    "revoke-down",
    "revoke-up",
    "fail-intent",
    "restore-intent",
    "expire-access",
    "held-invalid",
    "unknown-refresh",
    "release",
    "expire-lease",
    "cutoff",
    "expire-original",
  ]),
});
export const controlBindingFault = async ({
  request,
  fixture,
  sessions,
  state,
  binding,
}: {
  readonly request: Request;
  readonly fixture: FaultFixture;
  readonly sessions: SessionDependencies;
  readonly state: FaultState;
  readonly binding: Binding;
}) => {
  const { action } = actionSchema.parse(await request.json());
  switch (action) {
    case "inspect":
      return Response.json(
        await observeFaultBinding({ fixture, state, binding }),
      );
    case "revoke-down":
      state.nativeDown = true;
      break;
    case "revoke-up":
      state.nativeDown = false;
      break;
    case "fail-intent":
      state.failIntent = true;
      break;
    case "restore-intent":
      state.failIntent = false;
      break;
    case "expire-access":
      await expireOwnedAccess({ fixture, sessions, binding });
      break;
    case "held-invalid":
      state.refreshMode = "held-invalid";
      state.released = false;
      state.entered = false;
      break;
    case "unknown-refresh":
      state.refreshMode = "unknown";
      state.entered = false;
      break;
    case "release":
      state.released = true;
      break;
    case "expire-lease":
      if (!binding.attempt)
        throw new Error("Expected persisted refresh attempt");
      await fixture.web.webDb
        .collection("bff_sessions")
        .updateOne(
          { bindingId: binding.bindingId },
          { $set: { "attempt.leaseUntil": Date.now() - 1 } },
        );
      break;
    case "expire-original":
      if (!binding.attempt)
        throw new Error("Expected persisted unknown attempt");
      await fixture.web.webDb.collection("bff_sessions").updateOne(
        { bindingId: binding.bindingId },
        {
          $set: {
            expiresAt: Date.now() - 1,
            "attempt.leaseUntil": Date.now() - 1,
          },
        },
      );
      break;
    case "cutoff":
      if (!binding.attempt)
        throw new Error("Expected persisted unknown attempt");
      state.clockOverride = binding.attempt.recoverUntil;
      break;
    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported fault action ${exhaustive}`);
    }
  }
  return Response.json({ applied: action });
};

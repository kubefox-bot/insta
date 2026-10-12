import { Result } from "@bloodyowl/boxed";
import { waitUntil } from "../../barrier";
import type { FaultFixture, FaultState } from "./types";
export const createFaultBackend = ({
  fixture,
  state,
}: {
  readonly fixture: FaultFixture;
  readonly state: FaultState;
}) => {
  const sync = () =>
    fixture.native.advance(
      (state.clockOverride ?? Date.now()) - fixture.native.clock(),
    );
  return {
    authorize: async (
      ...args: Parameters<typeof fixture.dependencies.backend.authorize>
    ) => {
      sync();
      return fixture.dependencies.backend.authorize(...args);
    },
    revoke: async (
      ...args: Parameters<typeof fixture.dependencies.backend.revoke>
    ) => {
      sync();
      if (state.nativeDown)
        return Result.Error({ code: "DEPENDENCY_UNAVAILABLE" });
      return fixture.dependencies.backend.revoke(...args);
    },
    refresh: async (
      ...args: Parameters<typeof fixture.dependencies.backend.refresh>
    ) => {
      sync();
      state.refreshKeys.push(args[0].key);
      const mode = state.refreshMode;
      state.refreshMode = "normal";
      const receipt = await fixture.dependencies.backend.refresh(...args);
      if (mode === "normal") return receipt;
      state.entered = true;
      if (mode === "held-invalid") {
        await waitUntil({
          timeoutMs: 30000,
          check: async () => state.released,
        });
        return Result.Error({ code: "REFRESH_TOKEN_INVALID" });
      }
      return Result.Error({ code: "DEPENDENCY_UNAVAILABLE" });
    },
  };
};

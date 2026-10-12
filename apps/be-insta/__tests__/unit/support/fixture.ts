import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { createApplication } from "../../../src/app/bootstrap";
import type { SupportDependencies } from "../../../src/domains/support-reports/index";
import type { Reports } from "../../../src/domains/support-reports/ports/reports";
import type { ObservabilityOptions } from "../../../src/lib/observability/index";
export const createSupportHttpFixture = async (
  options: Readonly<{
    save?: Reports["save"];
    observability?: ObservabilityOptions;
  }> = {},
) => {
  const stored: unknown[] = [];
  const dependencies: SupportDependencies = {
    reports: {
      save:
        options.save ??
        (async (report) => {
          stored.push(report);
          return Result.Ok({
            reportId: report.reportId,
            emailState: "pending",
          });
        }),
      replay: async () => Result.Ok(null),
      recover: async () => [],
      claim: async () => null,
      finish: async () => {},
      cleanup: async () => {},
    },
    proof: {
      issue: async () => "support-proof",
      verify: async ({ proof }) =>
        proof === "support-proof"
          ? Result.Ok("context")
          : Result.Error(SupportErrorCode.SupportContextInvalid),
    },
    limits: { consume: async () => Result.Ok("allowed") },
    actor: async (token) =>
      token === "fixture-token"
        ? Result.Ok("verified-user")
        : Result.Error(SupportErrorCode.SupportIdentityUnavailable),
    fingerprint: (input) => JSON.stringify(input),
    clock: () => 1000,
    uuid: () => crypto.randomUUID(),
    jobs: {
      publish: async () => {},
      next: async () => null,
      acknowledge: async () => {},
    },
  };
  const app = await createApplication(
    {
      support: dependencies,
      checkRequired: async () => true,
      check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
      close: async () => {},
    },
    options.observability ?? { mode: "offline" },
  );
  await app.listen(0, "127.0.0.1");
  return { app, stored, url: await app.getUrl(), dependencies };
};

import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import type {
  FormContextDependencies,
  MailDispatchDependencies,
} from "../../../src/domains/support-reports/ports/types";
import { dispatchSupportMail } from "../../../src/domains/support-reports/use-cases/dispatch";
import { issueFormContext } from "../../../src/domains/support-reports/use-cases/issue-context";

test("form context needs only issuing proof, limits and identity sources", async () => {
  const dependencies: FormContextDependencies = {
    limits: { consume: async () => Result.Ok("allowed") },
    proof: { issue: async () => "proof" },
    clock: () => 1000,
    uuid: () => "context",
  };
  const result = await issueFormContext("source", dependencies);
  expect(result.isOk()).toBe(true);
  if (result.isOk())
    expect(result.get()).toEqual({
      proof: "proof",
      expiresAt: 86401000,
    });
});

test("mail dispatch needs only queue, mail persistence and sender contracts", async () => {
  const completed: string[] = [];
  const dependencies: MailDispatchDependencies = {
    reports: {
      recover: async () => [],
      claim: async () => null,
      finish: async () => {},
    },
    jobs: {
      next: async () => ({ id: "job", reportId: "report" }),
      acknowledge: async (id) => {
        completed.push(id);
      },
    },
    email: { send: async () => "accepted" },
    clock: () => 1000,
    uuid: () => "lease",
  };
  await dispatchSupportMail(dependencies, new AbortController().signal);
  expect(completed).toEqual(["job"]);
});

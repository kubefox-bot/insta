import { expect, test } from "bun:test";
import { consentPolicyVersion } from "@insta/contracts/privacy";
import { createRandom } from "../../../apps/be-insta/src/domains/privacy/server/index";

test("only a currently verified all proof supplies technical eligibility", async () => {
  const module = await import(
    "../../../apps/be-insta/src/domains/privacy/use-cases/analytics-reference"
  ).catch(() => undefined);
  expect(module).toBeDefined();
  if (!module) return;
  const random = createRandom();
  const proof = random.proof();
  const contextId = await random.digest(proof);
  const current = {
    contextId,
    revision: 1,
    policyVersion: consentPolicyVersion,
    generation: "generation",
    choice: "all" as const,
    createdAt: 1,
    expiresAt: 100,
  };
  const preferences = {
    generation: async () => "generation",
    find: async (input: { contextId: string }) =>
      input.contextId === contextId ? current : undefined,
    save: async () => "saved" as const,
  };
  const dependencies = { preferences, random, clock: () => 2 };
  expect(
    await module.resolveAnalyticsReference(
      { contextProof: proof },
      dependencies,
    ),
  ).toEqual({
    contextId,
    revision: 1,
    policyVersion: consentPolicyVersion,
    generation: "generation",
  });
  expect(
    await module.resolveAnalyticsReference({}, dependencies),
  ).toBeUndefined();
  expect(
    await module.resolveAnalyticsReference(
      { contextProof: random.proof() },
      dependencies,
    ),
  ).toBeUndefined();
  expect(
    await module.resolveAnalyticsReference(
      { contextProof: proof },
      { ...dependencies, clock: () => 100 },
    ),
  ).toBeUndefined();
  expect(
    await module.resolveAnalyticsReference(
      { contextProof: proof },
      {
        ...dependencies,
        preferences: {
          ...preferences,
          generation: async () => "new-generation",
        },
      },
    ),
  ).toBeUndefined();
});

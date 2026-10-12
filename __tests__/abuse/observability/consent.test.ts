import { expect, test } from "bun:test";
import {
  allowAnalytics,
  readPreference,
  savePreference,
} from "../../../apps/be-insta/src/domains/privacy/index";
import { createPrivacyEnvironment } from "../../fixtures/privacy-environment";

test("forged opt-in cannot permit intake; delayed outbox rechecks revocation while required effects survive", async () => {
  const fixture = await createPrivacyEnvironment();
  try {
    const optional: string[] = [];
    const required: string[] = [];
    const emit = async (
      reference?: Parameters<typeof allowAnalytics>[0]["reference"],
      dependencies = fixture.dependencies,
    ) => {
      required.push("business-committed");
      if ((await allowAnalytics({ reference }, dependencies)) === "allowed")
        optional.push("observation");
    };
    expect((await readPreference({}, fixture.dependencies)).choice).toBe(
      "necessary",
    );
    await emit();
    expect(optional).toHaveLength(0);
    const first = await savePreference(
      { choice: "all", policyVersion: 1, source: fixture.source },
      fixture.dependencies,
    );
    if (first.isError()) throw new Error(first.getError());
    const { contextProof, preference } = first.get();
    await emit(preference);
    expect(optional).toHaveLength(1);
    const barrier = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const delayed = (async () => {
      entered.resolve();
      await barrier.promise;
      await emit(preference);
    })();
    await entered.promise;
    const revoked = await savePreference(
      {
        contextProof,
        expectedRevision: 1,
        choice: "necessary",
        policyVersion: 1,
        source: fixture.source,
      },
      fixture.dependencies,
    );
    expect(revoked.isOk()).toBe(true);
    barrier.resolve();
    await delayed;
    await emit({ ...preference, policyVersion: 0 });
    await emit({ ...preference, generation: "old" });
    await emit({ ...preference, contextId: "FORGED" });
    expect(optional).toHaveLength(1);
    expect(required).toHaveLength(6);
    const unavailable = {
      ...fixture.dependencies,
      preferences: {
        ...fixture.dependencies.preferences,
        generation: async () => {
          throw new Error("isolated unavailable");
        },
      },
    };
    expect(await allowAnalytics({ reference: preference }, unavailable)).toBe(
      "unavailable",
    );
    await emit(preference, unavailable);
    expect(required).toHaveLength(7);
    expect(optional).toHaveLength(1);
  } finally {
    await fixture.dispose();
  }
});

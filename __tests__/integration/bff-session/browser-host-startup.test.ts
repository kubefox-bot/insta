import { expect, test } from "bun:test";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { cleanupBrowserBindings } from "../../fixtures/bff-session/browser-host/bindings";
import { startBrowserHost } from "../../fixtures/bff-session/browser-host/start";
import { createBffEnvironment } from "../../fixtures/bff-session/environment";
import { readTestApiConfig } from "../../fixtures/environment";
import { withOwnedProbe } from "../auth05/lib/probe";

for (const cleanupFails of [false, true]) {
  test(`I2 fault router startup failure removes actual owned accounts; cleanup failure=${cleanupFails}`, async () => {
    await withOwnedProbe({
      acquire: () => connectDatabase({ config: readTestApiConfig().mongo }),
      run: async (probe) => {
        const fixture = await createBffEnvironment();
        const owned = { emailKey: { $regex: `^${fixture.native.runId}-` } };
        const original = new Error("Owned router Mongo acquisition failed");
        const cleanup = new Error("After real owned fixture cleanup failed");
        const error = await startBrowserHost({
          createFixture: async () => ({
            ...fixture,
            dispose: async () => {
              await fixture.dispose();
              if (cleanupFails) throw cleanup;
            },
          }),
          createFaults: async () => {
            expect(
              await probe.apiDb.collection("users").countDocuments(owned),
            ).toBe(2);
            throw original;
          },
          serve: () => {
            throw new Error("HTTP must not start");
          },
          cleanupBindings: cleanupBrowserBindings,
        }).then(
          () => undefined,
          (error: unknown) => error,
        );
        if (cleanupFails) {
          expect(error).toBeInstanceOf(AggregateError);
          if (!(error instanceof AggregateError))
            throw new Error("Missing aggregate");
          expect(error.cause).toBe(original);
          expect(error.errors[0]).toBe(original);
          expect(error.errors[1].errors).toContain(cleanup);
        } else {
          expect(error).toBe(original);
        }
        expect(
          await probe.apiDb.collection("users").countDocuments(owned),
        ).toBe(0);
      },
    });
  });
}

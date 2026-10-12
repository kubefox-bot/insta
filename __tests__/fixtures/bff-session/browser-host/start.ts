import type { Fixture } from "../../auth05/host/types";
import { setupFailure } from "../../lifecycle/setup-failure";
import type { FaultRouter, HostDependencies } from "./types";

export const startBrowserHost = async <TFixture extends Fixture>(
  dependencies: HostDependencies<TFixture>,
) => {
  const fixture = await dependencies.createFixture();
  const emails: string[] = [];
  const acquired: {
    faults?: FaultRouter;
    server?: Readonly<{ stop: () => Promise<void> }>;
  } = {};
  const release = async () => {
    const failures: unknown[] = [];
    for (const cleanup of [
      () => acquired.faults?.release(),
      () => acquired.server?.stop(),
      () => dependencies.cleanupBindings({ fixture, emails }),
      () => fixture.dispose(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "BFF browser host cleanup failed");
  };
  let disposing: Promise<void> | null = null;
  const dispose = () => {
    disposing ??= release();
    return disposing;
  };
  try {
    const account = await fixture.native.account();
    emails.push(account.email);
    const secondAccount = await fixture.native.account();
    emails.push(secondAccount.email);
    const faults = await dependencies.createFaults({ fixture, emails });
    acquired.faults = faults;
    acquired.server = dependencies.serve({
      fixture,
      account,
      secondAccount,
      faults,
    });
    return { dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "BFF browser host startup and cleanup failed",
      });
    }
    throw error;
  }
};

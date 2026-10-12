import type { HostDependencies, RegistrationResources } from "./types";

const startupFailure = (error: unknown, cleanupError: unknown) =>
  new AggregateError(
    [error, cleanupError],
    "Auth host startup and cleanup failed",
    { cause: error },
  );

export const startAuthHost = async (dependencies: HostDependencies) => {
  const fixture = await dependencies.createFixture();
  const acquired: {
    registration?: RegistrationResources;
    observer?: ReturnType<HostDependencies["createObserver"]>;
    server?: ReturnType<HostDependencies["serve"]>;
  } = {};
  const dispose = async () => {
    const failures: unknown[] = [];
    for (const release of [
      () => acquired.server?.stop(),
      () => acquired.observer?.dispose(),
      () => acquired.registration?.cleanup(),
      () => acquired.registration?.close(),
      () => fixture.dispose(),
    ]) {
      try {
        await release();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, "Auth host cleanup failed");
  };
  try {
    const account = await fixture.native.account();
    const secondAccount = await fixture.native.account();
    const signupEmail = fixture.native.email("signup");
    const noJsEmail = fixture.native.email("nojs");
    const emails = new Set([signupEmail, noJsEmail]);
    acquired.registration = await dependencies.createRegistration(emails);
    acquired.observer = dependencies.createObserver(emails);
    acquired.server = dependencies.serve({
      account,
      secondAccount,
      signupEmail,
      noJsEmail,
    });
    return { dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw startupFailure(error, cleanupError);
    }
    throw error;
  }
};

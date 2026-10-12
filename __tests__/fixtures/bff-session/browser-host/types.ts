import type { Account, Fixture } from "../../auth05/host/types";

export type FaultRouter = Readonly<{
  request: (request: Request) => Response | Promise<Response>;
  release: () => void;
}>;
export type HostDependencies<TFixture extends Fixture> = Readonly<{
  createFixture: () => Promise<TFixture>;
  createFaults: (
    input: Readonly<{
      fixture: TFixture;
      emails: readonly string[];
    }>,
  ) => Promise<FaultRouter>;
  serve: (
    input: Readonly<{
      fixture: TFixture;
      account: Account;
      secondAccount: Account;
      faults: FaultRouter;
    }>,
  ) => Readonly<{ stop: () => Promise<void> }>;
  cleanupBindings: (
    input: Readonly<{
      fixture: TFixture;
      emails: readonly string[];
    }>,
  ) => Promise<void>;
}>;

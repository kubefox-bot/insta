export type Account = Readonly<{ email: string; password: string }>;
export type Fixture = Readonly<{
  native: Readonly<{
    account: () => Promise<Account>;
    email: (purpose: string) => string;
  }>;
  dispose: () => Promise<void>;
}>;
export type RegistrationResources = Readonly<{
  cleanup: () => Promise<void>;
  close: () => void;
}>;
export type HostDependencies = Readonly<{
  createFixture: () => Promise<Fixture>;
  createRegistration: (
    emails: ReadonlySet<string>,
  ) => Promise<RegistrationResources>;
  createObserver: (
    emails: ReadonlySet<string>,
  ) => Readonly<{ dispose: () => Promise<void> }>;
  serve: (
    credentials: Readonly<{
      account: Account;
      secondAccount: Account;
      signupEmail: string;
      noJsEmail: string;
    }>,
  ) => Readonly<{ stop: () => Promise<void> }>;
}>;

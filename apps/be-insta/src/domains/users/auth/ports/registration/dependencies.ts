import type { AuthPersistence } from "../../../ports/auth-persistence";
import type { AuthDependencies } from "../dependencies";
import type { Challenges } from "./challenges";
import type { RegistrationCrypto } from "./crypto";
import type { RegistrationPersistence } from "./persistence";
export type RegistrationDependencies = Readonly<{
  challenges: Challenges;
  crypto: RegistrationCrypto;
  registration: RegistrationPersistence;
  persistence: AuthPersistence;
  auth: AuthDependencies;
}>;

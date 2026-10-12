import type { createRegistrationBackend } from "../adapters/registration";
import type { AuthRequest, AuthTransportDependencies } from "../types";
import type { readRegistration } from "./cookie";
export type RegistrationDependencies = AuthTransportDependencies &
  Readonly<{ registration: ReturnType<typeof createRegistrationBackend> }>;
export type RegistrationStep = Readonly<{
  values: Readonly<Record<string, unknown>>;
  state: Awaited<ReturnType<typeof readRegistration>>;
  input: AuthRequest;
  dependencies: RegistrationDependencies;
}>;

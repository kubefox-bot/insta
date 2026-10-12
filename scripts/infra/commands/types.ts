export type HostApp = "backend" | "frontend";
export type ProcessGroupSignal = 0 | "SIGTERM" | "SIGKILL";
export type ProcessGroupSignalOutcome =
  | { readonly kind: "present" }
  | { readonly kind: "absent" }
  | { readonly kind: "denied"; readonly error: Error };
export type SendProcessGroupSignal = (
  target: number,
  signal: ProcessGroupSignal,
) => void;
export type ProcessInput = {
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly quiet?: boolean;
};
export type InfrastructureCommand =
  | { readonly kind: "prepare" }
  | { readonly kind: "infrastructure" }
  | { readonly kind: "compose"; readonly services: readonly string[] }
  | { readonly kind: "down" }
  | { readonly kind: "dev"; readonly apps: readonly HostApp[] }
  | { readonly kind: "build"; readonly app: HostApp };

export type OperatorCommand =
  | "infra:prepare"
  | "infra:up"
  | "compose:backend"
  | "compose:frontend"
  | "compose:up"
  | "compose:down"
  | "up"
  | "down"
  | "dev:backend"
  | "dev:frontend"
  | "dev"
  | "build:backend"
  | "build:frontend";

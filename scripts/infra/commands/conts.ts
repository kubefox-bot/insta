import type { HostApp, InfrastructureCommand, OperatorCommand } from "./types";
export const commands = {
  "infra:prepare": { kind: "prepare" },
  "infra:up": { kind: "infrastructure" },
  "compose:backend": { kind: "compose", services: ["be-insta"] },
  "compose:frontend": { kind: "compose", services: ["fe-insta"] },
  "compose:up": { kind: "compose", services: [] },
  "compose:down": { kind: "down" },
  up: { kind: "compose", services: [] },
  down: { kind: "down" },
  "dev:backend": { kind: "dev", apps: ["backend"] },
  "dev:frontend": { kind: "dev", apps: ["frontend"] },
  dev: { kind: "dev", apps: ["backend", "frontend"] },
  "build:backend": { kind: "build", app: "backend" },
  "build:frontend": { kind: "build", app: "frontend" },
} as const satisfies Record<OperatorCommand, InfrastructureCommand>;
export const appDirectories = {
  backend: "apps/be-insta",
  frontend: "apps/fe-insta",
} as const satisfies Record<HostApp, string>;
export const processGroupPollMs = 100;
export const processGroupKillSettlementMs = 5000;
export const processGroupSignalRetryTimeoutMs = 5000;

export const defaultApplicationServices = [
  "be-insta",
  "fe-insta",
  "traefik",
] as const;

import type { NestExpressApplication } from "@nestjs/platform-express";
import type { RuntimeObservability } from "../../lib/observability/index";
import type { RuntimeDependencies } from "../composition/index";
import type { startupCloseOrder } from "./conts";
import type { createStartupLifecycle } from "./startup";

export type ApplicationServicesLifecycle = Readonly<{
  close?: () => Promise<void>;
}>;

export type StartupStageName = (typeof startupCloseOrder)[number];

export type StartupResource<Resource> = Readonly<{
  name: StartupStageName;
  start: () => Resource | Promise<Resource>;
  close: (resource: Resource) => Promise<void>;
}>;

export type ApplicationServicesStartup = Readonly<{
  app: NestExpressApplication;
  dependencies: RuntimeDependencies;
  observability: RuntimeObservability | undefined;
  lifecycle: Pick<ReturnType<typeof createStartupLifecycle>, "start">;
}>;

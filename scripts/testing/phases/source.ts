import type { PhaseTarget } from "./types";
export const createSourceTargets = (): readonly PhaseTarget[] => [
  {
    name: "tooling-app-type-build",
    paths: ["source-checks"],
    commands: [
      [process.execPath, "run", "lint"],
      [process.execPath, "run", "lint:boundaries"],
      [process.execPath, "run", "typecheck"],
      [process.execPath, "run", "--cwd", "packages/contracts", "check"],
      [process.execPath, "run", "--cwd", "packages/ui-kit", "check"],
      [process.execPath, "run", "--cwd", "apps/be-insta", "check"],
      [process.execPath, "run", "--cwd", "apps/fe-insta", "check"],
      [
        process.execPath,
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "-p",
        "__tests__/compatibility/tsconfig.json",
      ],
      [process.execPath, "run", "build"],
    ],
  },
  {
    name: "contracts-unit",
    paths: ["contracts-unit"],
    commands: [
      [process.execPath, "run", "contracts:check"],
      [process.execPath, "run", "test"],
      [process.execPath, "run", "--cwd", "apps/be-insta", "test:unit"],
      [process.execPath, "run", "test:compatibility"],
    ],
  },
  {
    name: "frontend-vite-config",
    paths: [
      "apps/fe-insta/__tests__/config/local-realtime-proxy.test.ts",
      "apps/fe-insta/__tests__/config/ssr-observability.test.ts",
    ],
    commands: [
      [process.execPath, "run", "--cwd", "apps/fe-insta", "test:config"],
    ],
  },
];

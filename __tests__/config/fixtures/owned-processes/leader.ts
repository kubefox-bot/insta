import { spawn } from "node:child_process";
import { z } from "zod";

const child = spawn(
  process.execPath,
  ["--no-env-file", "__tests__/config/fixtures/owned-processes/descendant.ts"],
  { stdio: ["ignore", "ignore", "ignore", "ipc"] },
);
child.once("message", (message) => {
  console.log(
    JSON.stringify({
      groupId: process.pid,
      ...z.object({ port: z.number().int().positive() }).parse(message),
    }),
  );
  process.exit(0);
});
child.once("error", () => process.exit(1));

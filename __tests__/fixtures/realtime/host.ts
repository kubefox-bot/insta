import process from "node:process";

const child = Bun.spawn(
  [process.execPath, "__tests__/fixtures/realtime/browser-host.ts"],
  { cwd: "apps/be-insta", stdout: "inherit", stderr: "inherit" },
);
process.once("SIGTERM", () => child.kill("SIGTERM"));
process.exit(await child.exited);

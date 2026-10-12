import { createHash } from "node:crypto";
import { z } from "zod";
import {
  frontendPath,
  installTimeoutMs,
  serverGroupId,
  serverUserId,
  workspacePath,
} from "./conts";

const install = Bun.spawn(
  [process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"],
  {
    cwd: workspacePath,
    stdout: "inherit",
    stderr: "inherit",
    timeout: installTimeoutMs,
  },
);
if (await install.exited)
  throw new Error("Frozen Linux dependency installation failed");
const frontend = z
  .object({ dependencies: z.record(z.string(), z.string()) })
  .parse(await Bun.file(`${frontendPath}/package.json`).json());
const dependency = z
  .object({ version: z.string() })
  .parse(
    await Bun.file(
      `${workspacePath}/node_modules/intl-messageformat/package.json`,
    ).json(),
  );
const manifest = z
  .object({ packageManager: z.string() })
  .parse(await Bun.file(`${workspacePath}/package.json`).json());
if (
  `bun@${Bun.version}` !== manifest.packageManager ||
  dependency.version !== frontend.dependencies["intl-messageformat"] ||
  process.platform !== "linux"
)
  throw new Error("Runtime/dependency identity mismatch");
const fingerprint = z
  .object({
    sourceHash: z.string(),
    files: z.record(
      z
        .string()
        .refine(
          (path) => !path.startsWith("/") && !path.split("/").includes(".."),
        ),
      z.string().regex(/^[a-f0-9]{64}$/),
    ),
  })
  .parse(await Bun.file(`${workspacePath}/auth05-freeze.json`).json());
for (const [path, expected] of Object.entries(fingerprint.files)) {
  const hash = createHash("sha256")
    .update(
      Buffer.from(await Bun.file(`${workspacePath}/${path}`).arrayBuffer()),
    )
    .digest("hex");
  if (hash !== expected) throw new Error(`Frozen artifact mismatch: ${path}`);
}
process.stdout.write(
  `${JSON.stringify({ runtime: "linux", bun: Bun.version, formatjs: dependency.version, sourceHash: fingerprint.sourceHash, verifiedFiles: Object.keys(fingerprint.files).length })}\n`,
);
const server = Bun.spawn(
  [
    process.execPath,
    "--preload",
    "./dist/observability-preload.js",
    "dist/index.js",
  ],
  {
    cwd: frontendPath,
    uid: serverUserId,
    gid: serverGroupId,
    stdout: "inherit",
    stderr: "inherit",
  },
);
process.once("SIGTERM", () => server.kill("SIGTERM"));
process.once("SIGINT", () => server.kill("SIGINT"));
process.exit(await server.exited);

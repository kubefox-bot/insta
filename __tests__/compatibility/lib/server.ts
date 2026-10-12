import { createServer } from "node:net";
import type { ServerOptions } from "./types";

export const reservePort = async () => {
  const reservation = createServer();
  await new Promise<void>((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  if (!address || typeof address === "string")
    throw new Error("TCP port reservation failed");
  return address.port;
};

const waitForResponse = async (url: string) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(500) });
    } catch (error) {
      const code =
        error instanceof Error && "code" in error ? String(error.code) : "";
      if (!["ECONNREFUSED", "ECONNRESET", "ConnectionRefused"].includes(code))
        throw error;
      await Bun.sleep(25);
    }
  }
  throw new Error(`Server did not become reachable: ${url}`);
};

export const withHttpServer = async (options: ServerOptions) => {
  const port = await reservePort();
  const child = Bun.spawn([process.execPath, ...options.args], {
    cwd: options.cwd,
    env: Object.fromEntries([
      ...Object.entries(options.environment ?? {}),
      ["HOST", "127.0.0.1"],
      ["PORT", String(port)],
      ["NODE_ENV", "test"],
    ]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = new Response(child.stdout).text();
  const errors = new Response(child.stderr).text();
  try {
    const response = await waitForResponse(
      `http://127.0.0.1:${port}${options.path}`,
    );
    await options.assertResponse(response);
  } finally {
    child.kill();
    await child.exited;
  }
  const [stdout, stderr] = await Promise.all([output, errors]);
  if (stderr) throw new Error(`Server stderr: ${stderr}\n${stdout}`);
};

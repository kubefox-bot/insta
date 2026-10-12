import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type InlineConfig, type ViteDevServer } from "vite";

type IsolatedViteTestServerOptions<T> = {
  readonly config: InlineConfig;
  readonly run: (server: ViteDevServer) => Promise<T>;
};

export const withIsolatedViteTestServer = async <T>({
  config,
  run,
}: IsolatedViteTestServerOptions<T>): Promise<T> => {
  const cacheDir = await mkdtemp(join(tmpdir(), "insta-vite-config-test-"));

  try {
    const server = await createServer({ ...config, cacheDir });
    try {
      return await run(server);
    } finally {
      await server.close();
    }
  } finally {
    await rm(cacheDir, { force: true, recursive: true });
  }
};

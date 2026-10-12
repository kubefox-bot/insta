import { setupFailure } from "./setup-failure";

export const withResource = async <
  Resource extends { dispose: () => Promise<unknown> },
>({
  start,
  use,
}: Readonly<{
  start: () => Promise<Resource>;
  use: (resource: Resource) => Promise<void>;
}>) => {
  const resource = await start();
  try {
    await use(resource);
  } catch (error) {
    try {
      await resource.dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "UI acceptance use and cleanup failed",
      });
    }
    throw error;
  }
  await resource.dispose();
};

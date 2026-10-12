export const disposeStoryHost = async ({
  stop,
  cleanup,
  closeBroker,
  closeFixture,
}: Readonly<{
  stop: () => Promise<void>;
  cleanup: () => Promise<void>;
  closeBroker: () => void;
  closeFixture: () => Promise<void>;
}>) => {
  const failures: unknown[] = [];
  for (const release of [stop, cleanup, closeBroker, closeFixture]) {
    try {
      await release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Stories host cleanup failed");
};

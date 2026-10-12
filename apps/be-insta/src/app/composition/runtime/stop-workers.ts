/** Ждёт settlement обеих групп runtime workers и только затем передаёт первую ошибку остановки. */
export const stopRuntimeWorkers = async ({
  mail,
  stories,
}: Readonly<{
  mail: () => Promise<void>;
  stories: (() => Promise<void>) | undefined;
}>) => {
  const settled = await Promise.allSettled([mail(), stories?.()]);
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
};

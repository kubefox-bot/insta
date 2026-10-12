import type { Page } from "@playwright/test";

const clearBrowserQueue = async ({
  tabs,
  namespace,
}: Readonly<{ tabs: readonly Page[]; namespace: string }>) => {
  const owned = tabs.filter(
    (tab) =>
      !tab.isClosed() && new URL(tab.url()).origin === "https://localhost",
  );
  const closed = await Promise.allSettled(
    owned.map((tab) => tab.evaluate(() => window.__outboxProbe?.close())),
  );
  const failures = closed
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  const tab = owned[0];
  if (tab)
    await tab.evaluate(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () =>
            reject(new Error("Owned IDB cleanup blocked"));
        }),
      namespace,
    );
  if (failures.length)
    throw new AggregateError(failures, "Owned browser queue close failed");
};
export const cleanupOutbox = async ({
  tabs,
  namespace,
  disposers = [],
}: Readonly<{
  tabs: readonly Page[];
  namespace: string;
  disposers?: readonly (() => Promise<void>)[];
}>) => {
  const cleaned = await Promise.allSettled([
    clearBrowserQueue({ tabs, namespace }),
    ...disposers.map((dispose) => dispose()),
  ]);
  const failures = cleaned
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason);
  if (failures.length)
    throw new AggregateError(failures, "Owned outbox cleanup failed");
};

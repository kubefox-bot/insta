import { setupFailure } from "../lifecycle/setup-failure";
import { startRealtimeFixture } from "../realtime/start-browser";
export const startOutboxPair = async () => {
  const primary = await startRealtimeFixture();
  try {
    return { primary, other: await startRealtimeFixture() };
  } catch (error) {
    try {
      await primary.dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "Outbox paired fixture setup and cleanup failed",
      });
    }
    throw error;
  }
};

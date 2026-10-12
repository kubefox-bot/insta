import {
  createSupportEmail,
  startSupportWorker,
} from "../../../../apps/be-insta/src/domains/support-reports/server/index";
import { restartConfig } from "./config";
import { connectRestart } from "./connect";

const config = restartConfig(process.argv[2] ?? "");
const connection = await connectRestart(config);
const email = createSupportEmail({
  ...config.smtp,
  recipient: config.recipient,
});
const worker = startSupportWorker({ ...connection.dependencies, email });
const stopped = Promise.withResolvers<void>();
const stop = () => stopped.resolve();
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
process.stdout.write("support-restart-worker-ready\n");
try {
  await stopped.promise;
} finally {
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
  try {
    await worker.close();
  } finally {
    try {
      await email.close();
    } finally {
      await connection.close();
    }
  }
}

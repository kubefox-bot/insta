import { parentPort } from "node:worker_threads";
import { StoryErrorCode } from "@insta/contracts/errors";
import { inspectPacketFile } from "./packets";

if (!parentPort) throw new Error("Media inspector requires a worker");
const port = parentPort;
port.on(
  "message",
  (input: Readonly<{ bytes: Uint8Array; maxDurationMs: number }>) => {
    inspectPacketFile(input).then(
      (result) =>
        port.postMessage(
          result.isError()
            ? { error: result.getError() }
            : { value: result.get() },
        ),
      () => port.postMessage({ error: StoryErrorCode.MalformedMedia }),
    );
  },
);

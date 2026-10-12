import { readlink } from "node:fs/promises";
import { launchDecoder } from "../../../apps/be-insta/src/domains/stories/adapters/media/launch-decoder";
import { readDecoder } from "../../../apps/be-insta/src/domains/stories/adapters/media/read-decoder";

const source = await Bun.file(
  new URL("./webm/fresh/chrome-vp9-streaming-max.webm", import.meta.url),
).bytes();
const child = launchDecoder(source, { container: "webm" });
const abort = new AbortController();
const stop = () => {
  abort.abort();
  if (child.exitCode === null) child.kill("SIGKILL");
};
process.once("SIGTERM", stop);
try {
  if (!("pid" in child) || typeof child.pid !== "number")
    throw Error("Native decoder process ID missing");
  const pid = child.pid;
  const deadline = Date.now() + 2000;
  const readReadyProcess = async (): Promise<{
    readonly limits: string;
    readonly executable: string;
  }> => {
    const [limits, executable] = await Promise.all([
      Bun.file(`/proc/${pid}/limits`).text(),
      readlink(`/proc/${pid}/exe`),
    ]);
    if (
      executable === "/usr/bin/ffprobe" &&
      /Max address space\s+536870912\s+536870912/.test(limits)
    )
      return { limits, executable };
    if (Date.now() >= deadline || child.exitCode !== null)
      throw Error(
        "Native decoder did not exec with applied caps before settlement",
      );
    await new Promise<void>((resolve) => setImmediate(resolve));
    return readReadyProcess();
  };
  const { limits, executable } = await readReadyProcess();
  const command = await Bun.file(`/proc/${pid}/cmdline`).text();
  const liveBeforeAbort = child.exitCode === null;
  const operation = readDecoder({ child, signal: abort.signal });
  abort.abort();
  const output = await operation;
  const exit = await child.exited;
  const existsAfterSettlement = await Bun.file(`/proc/${pid}/stat`).exists();
  console.log(
    JSON.stringify({
      limits,
      executable,
      command,
      liveBeforeAbort,
      output,
      exit,
      existsAfterSettlement,
    }),
  );
} finally {
  process.removeListener("SIGTERM", stop);
  stop();
  await child.exited;
}

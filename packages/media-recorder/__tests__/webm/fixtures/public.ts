import { repairWebmDuration } from "@insta/media-recorder/webm";
import { fixture } from "../fixture";

const source = fixture();
const result = await repairWebmDuration({
  blob: source.blob,
  elapsedMs: 900,
  maxBytes: 1_048_576,
});
if (result.isError() || result.get() === source.blob)
  throw new Error("public browser repair failed");

import { fixParsedWebmDuration } from "@fix-webm-duration/fix";
import { WebmContainer, WebmFile, WebmFloat } from "@fix-webm-duration/parser";
import { float32Bytes, float64Bytes, providerIds } from "../conts";
import { WebmFailure } from "../failure";
import { encodeIdentifier, encodeSize } from "../insertion/size";
import { ids, maxSizeBytes } from "../layout/conts";
import type { InfoLayout } from "../layout/types";

/** The provider sees only checked Info, never Tracks, Clusters or indices. */
export const repairedDuration = ({
  bytes,
  info,
  elapsedMs,
  floatBytes,
}: Readonly<{
  bytes: Uint8Array;
  info: InfoLayout;
  elapsedMs: number;
  floatBytes: number;
}>) => {
  const source = bytes.subarray(info.element.start, info.element.end);
  // The provider reads 0xff as finite 127. A finite full-width size contains
  // the complete bounded Info; none of these wrapper bytes enter the output.
  const segmentFragmentHeader = new Uint8Array([
    ...encodeIdentifier(ids.segment),
    ...encodeSize({ size: source.length, width: maxSizeBytes }),
  ]);
  const fragment = new Uint8Array(segmentFragmentHeader.length + source.length);
  fragment.set(segmentFragmentHeader);
  fragment.set(source, segmentFragmentHeader.length);
  const file = new WebmFile(fragment);
  if (!fixParsedWebmDuration(file, elapsedMs, { logger: false }))
    throw new WebmFailure("repair-failed");
  const segment = file.getSectionById(providerIds.segment);
  const fixedInfo = segment?.getSectionById(providerIds.info);
  if (!(fixedInfo instanceof WebmContainer))
    throw new WebmFailure("repair-failed");
  const duration = fixedInfo.getSectionById(providerIds.duration);
  if (!(duration instanceof WebmFloat)) throw new WebmFailure("repair-failed");
  // Public Float API preserves compact native/indexed slots without serializing other fields.
  if (floatBytes !== float32Bytes && floatBytes !== float64Bytes)
    throw new WebmFailure("unsupported-layout");
  const compact = new WebmFloat("Duration");
  compact.setSource(new Uint8Array(floatBytes));
  compact.setValue(duration.getValue());
  const payload = compact.source;
  if (
    !payload ||
    payload.length !== floatBytes ||
    !Number.isFinite(compact.getValue()) ||
    compact.getValue() <= 0
  )
    throw new WebmFailure("repair-failed");
  return payload;
};

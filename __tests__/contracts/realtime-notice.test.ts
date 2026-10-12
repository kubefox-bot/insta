import { expect, test } from "bun:test";
import * as realtime from "@insta/contracts/realtime";

const notice = {
  version: 1,
  kind: "delivery-notice",
  subscriptionId: "7ee32a62-1281-4ac6-83e8-7f10d0112233",
  streamId: "conversation:alice-bob",
  epoch: "7ee32a62-1281-4ac6-83e8-7f10d0112244",
  code: "DELIVERY_BLOCKED",
};

test("terminal notice and its receipt accept the same bounded identity without a business cursor", () => {
  expect(realtime.deliveryNoticeSchema?.safeParse(notice).success).toBe(true);
  expect(realtime.deliveryNoticeReceiptSchema?.safeParse(notice).success).toBe(
    true,
  );
  expect(
    realtime.deliveryNoticeSchema.safeParse({
      ...notice,
      code: "RESYNC_REQUIRED",
    }).success,
  ).toBe(true);
  for (const invalid of [
    { ...notice, version: 2 },
    { ...notice, cursor: 10 },
    { ...notice, code: "INTERNAL_ERROR" },
    { ...notice, subscriptionId: "foreign" },
    { ...notice, epoch: "" },
  ]) {
    expect(realtime.deliveryNoticeSchema.safeParse(invalid).success).toBe(
      false,
    );
    expect(
      realtime.deliveryNoticeReceiptSchema.safeParse(invalid).success,
    ).toBe(false);
  }
});

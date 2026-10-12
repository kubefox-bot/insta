import { expect, spyOn, test } from "bun:test";
import { submitLocale } from "../../../apps/fe-insta/src/lib/i18n/browser/index";

test("locale transport preserves POST form identity and JSON accept", async () => {
  const request = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 204 }),
  );
  try {
    const form = new FormData();
    form.set("locale", "ru");
    form.set("returnTo", "/conversations?intentId=selected");
    await submitLocale(form);
    expect(request).toHaveBeenCalledWith("/locale", {
      method: "POST",
      body: form,
      headers: { accept: "application/json" },
    });
  } finally {
    request.mockRestore();
  }
});

test("locale transport rejects HTTP and network failures while allowing retry with the same form", async () => {
  const request = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  try {
    const form = new FormData();
    form.set("locale", "ru");
    await expect(submitLocale(form)).rejects.toThrow("LOCALE_UNAVAILABLE");
    expect(form.get("locale")).toBe("ru");
    await expect(submitLocale(form)).rejects.toThrow("offline");
    await submitLocale(form);
    expect(request).toHaveBeenCalledTimes(3);
  } finally {
    request.mockRestore();
  }
});

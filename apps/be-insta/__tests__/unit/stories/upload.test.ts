import { expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { createStoryUpload } from "../../../src/domains/stories/adapters/http/upload";

test("multipart source is lazy and ignores client duration", async () => {
  const request = new PassThrough();
  const file = createStoryUpload({
    request,
    contentType: "multipart/form-data; boundary=story",
  });
  expect(request.readableFlowing).toBe(null);
  const reading = file(new AbortController().signal);
  request.end(
    '--story\r\nContent-Disposition: form-data; name="durationMs"\r\n\r\n1\r\n--story\r\nContent-Disposition: form-data; name="video"; filename="a.mp4"\r\nContent-Type: video/mp4\r\n\r\nabc\r\n--story--\r\n',
  );
  const upload = await reading;
  expect(await new Response(upload.source).text()).toBe("abc");
  await upload.complete;
});
test("multipart rejects second file before publication", async () => {
  const request = new PassThrough();
  const reading = createStoryUpload({
    request,
    contentType: "multipart/form-data; boundary=s",
  })(new AbortController().signal);
  request.end(
    '--s\r\nContent-Disposition: form-data; name="video"; filename="a"\r\n\r\nx\r\n--s\r\nContent-Disposition: form-data; name="video"; filename="b"\r\n\r\ny\r\n--s--\r\n',
  );
  await expect(
    reading.then(async (upload) => {
      await new Response(upload.source).text();
      await upload.complete;
    }),
  ).rejects.toThrow();
});

test("multipart classifies invalid envelope and actual file overflow", async () => {
  const invalid = new PassThrough();
  await expect(
    createStoryUpload({ request: invalid, contentType: "text/plain" })(
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "INVALID_UPLOAD" });
  const request = new PassThrough();
  const reading = createStoryUpload({
    request,
    contentType: "multipart/form-data; boundary=s",
  })(new AbortController().signal);
  request.write(
    '--s\r\nContent-Disposition: form-data; name="video"; filename="a"\r\n\r\nx',
  );
  const upload = await reading;
  const bytes = new Response(upload.source).arrayBuffer();
  bytes.catch(() => undefined);
  request.end(
    Buffer.concat([Buffer.alloc(20971521), Buffer.from("\r\n--s--\r\n")]),
  );
  await expect(bytes).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  await expect(upload.complete).rejects.toMatchObject({
    code: "FILE_TOO_LARGE",
  });
});

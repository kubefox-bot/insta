export const watchPublicRequests = (page: import("@playwright/test").Page) => {
  const calls = { feed: 0, playback: [] as string[], publish: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/playback")) calls.playback.push(path);
    if (path !== "/api/stories") return;
    switch (request.method()) {
      case "GET":
        calls.feed++;
        return;
      case "POST":
        calls.publish++;
        return;
    }
  });
  return calls;
};

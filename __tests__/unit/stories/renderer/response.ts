import { rendererPolicy } from "./conts";
export const rendererResponse = (request: Request) => {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(rendererPolicy.base)) return null;
  const asset = path.slice(rendererPolicy.base.length);
  if (!/^(?:index\.html|assets\/[\w-]+\.(?:js|css|mp4))$/.test(asset))
    return new Response(null, { status: 404 });
  return new Response(Bun.file(`${rendererPolicy.output}/${asset}`));
};

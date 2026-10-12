import type { RequestHandler } from "@sveltejs/kit";
/** Передаёт запрос form context владельцу support с browser cookies и origin, не создавая собственную политику допуска или срок действия. */
export const POST: RequestHandler = ({ request, url, cookies, locals }) =>
  locals.support.context({ request, origin: url.origin, cookies });

import { auth } from "@/lib/auth";
import { basePath } from "@/lib/paths";

/**
 * Next strips the basePath from route-handler URLs, but Better Auth's router
 * matches on its full public path (e.g. /opentab/api/auth), so restore it.
 */
async function handler(req: Request) {
  const url = new URL(req.url);
  if (!basePath || url.pathname.startsWith(`${basePath}/`)) return auth.handler(req);
  url.pathname = `${basePath}${url.pathname}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return auth.handler(
    new Request(url, {
      method: req.method,
      headers: req.headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      signal: req.signal,
    }),
  );
}

export { handler as GET, handler as POST };

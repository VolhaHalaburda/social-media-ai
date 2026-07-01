// Derive the deployment's own absolute base URL from an incoming request, so a
// serverless invocation can trigger the next one by calling back into itself.
// Uses forwarded headers (set by Vercel's proxy and by `next dev`) so it works
// on preview/prod domains, custom domains, and localhost alike.
export function baseUrlFromRequest(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

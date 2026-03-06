import { redirect } from "react-router";

/**
 * CRITICAL — DO NOT simplify this to `redirect(path)`.
 *
 * Shopify's `authenticate.admin` calls `ensureAppIsEmbeddedIfRequired`, which
 * checks for `embedded=1` in the URL. If that param is missing it redirects
 * the iframe to admin.shopify.com/oauth, which loads accounts.shopify.com
 * inside the iframe → blocked by X-Frame-Options → blank screen / auth loop.
 *
 * The `shop`, `host`, and `embedded` params injected by Shopify admin MUST be
 * forwarded on every redirect within /app/* routes so the auth flow stays intact.
 */
export function shopifyRedirect(request: Request, path: string) {
  const params = new URL(request.url).searchParams.toString();
  return redirect(`${path}${params ? `?${params}` : ""}`);
}

import posthog from "posthog-js";

export const SESSION_EXPIRED_MESSAGE = "Session expired — please refresh the page.";

type AuthEventName =
  | "auth_request_token_fallback"
  | "auth_request_unauthorized"
  | "auth_request_html_response";

type AuthEventProps = {
  path: string;
  status?: number;
  redirected?: boolean;
  contentType?: string;
  error?: string;
};

type FetchWithShopifyAuthArgs = {
  getToken: () => Promise<string>;
  input: RequestInfo | URL;
  init?: RequestInit;
};

function toPath(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname;
  return input.url;
}

function trackAuthEvent(name: AuthEventName, props: AuthEventProps) {
  try {
    posthog.capture(name, props);
  } catch {
    // PostHog may not be initialized yet; keep the request flow resilient.
  }
}

function createSessionExpiredResponse(status = 401) {
  return new Response(JSON.stringify({ error: SESSION_EXPIRED_MESSAGE }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function shouldTreatAsSessionExpiry(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return true;
  }

  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();

  // A successful JSON response is never a session expiry, even if the
  // request was redirected through Shopify's auth bounce.
  if (response.ok && contentType.includes("application/json")) {
    return false;
  }

  return response.redirected || contentType.includes("text/html");
}

export function isSessionExpiredResponse(response: Response): boolean {
  if (response.status !== 401 && response.status !== 403) {
    return false;
  }

  const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
  return contentType.includes("application/json");
}

export async function fetchWithShopifyAuth({
  getToken,
  input,
  init = {},
}: FetchWithShopifyAuthArgs): Promise<Response> {
  const path = toPath(input);
  const headers = new Headers(init.headers);

  try {
    const token = await getToken();
    headers.set("Authorization", `Bearer ${token}`);
  } catch (error) {
    trackAuthEvent("auth_request_token_fallback", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const response = await fetch(input, { ...init, headers });
  if (!shouldTreatAsSessionExpiry(response)) {
    return response;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (response.status === 401 || response.status === 403) {
    trackAuthEvent("auth_request_unauthorized", {
      path,
      status: response.status,
      redirected: response.redirected,
      contentType,
    });
    return createSessionExpiredResponse(response.status);
  }

  trackAuthEvent("auth_request_html_response", {
    path,
    status: response.status,
    redirected: response.redirected,
    contentType,
  });
  return createSessionExpiredResponse(401);
}

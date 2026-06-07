import { isAnalyticsOptedOut } from "./analyticsOptOut";

export const GOOGLE_ANALYTICS_ID = "G-QZ7YDMRCWD";

type GoogleAnalyticsParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function initGoogleAnalytics() {
  if (typeof window === "undefined" || isAnalyticsOptedOut()) {
    return false;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    function gtag() {
      window.dataLayer?.push(arguments);
    };

  if (initialized) {
    return true;
  }

  window.gtag("js", new Date());
  window.gtag("config", GOOGLE_ANALYTICS_ID, { send_page_view: false });

  if (!document.querySelector(`script[src*="gtag/js?id=${GOOGLE_ANALYTICS_ID}"]`)) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`;
    document.head.appendChild(script);
  }

  initialized = true;
  return true;
}

export function trackGoogleAnalyticsPageview(path: string) {
  if (!initGoogleAnalytics()) {
    return;
  }

  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export function trackGoogleAnalyticsEvent(
  name: string,
  params: GoogleAnalyticsParams = {},
) {
  if (!initGoogleAnalytics()) {
    return;
  }

  window.gtag?.("event", name, params);
}

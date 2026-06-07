import { track } from "@vercel/analytics/react";
import { isAnalyticsOptedOut } from "./analyticsOptOut";
import { trackGoogleAnalyticsEvent } from "./googleAnalytics";

type MarketingEventName =
  | "app_store_link_clicked"
  | "demo_download_clicked"
  | "demo_generation_failed"
  | "demo_model_selected"
  | "demo_result_viewed"
  | "demo_started"
  | "demo_upload_selected"
  | "demo_viewed"
  | "install_cta_clicked"
  | "pricing_cta_clicked"
  | "pricing_viewed"
  | "try_demo_clicked";

type MarketingEventProperties = Record<string, string | number | boolean | null>;

export function trackMarketingEvent(
  name: MarketingEventName,
  properties: MarketingEventProperties = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (isAnalyticsOptedOut()) {
      return;
    }

    track(name, {
      path: window.location.pathname,
      ...properties,
    });
    trackGoogleAnalyticsEvent(name, {
      path: window.location.pathname,
      ...properties,
    });
  } catch {
    // Analytics must never block primary navigation or form actions.
  }
}

export function trackShopifyAppStoreClick(
  source: string,
  ctaText: string,
  properties: MarketingEventProperties = {},
) {
  trackMarketingEvent("install_cta_clicked", {
    source,
    cta_text: ctaText,
    destination: "shopify_app_store",
    ...properties,
  });
  trackMarketingEvent("app_store_link_clicked", {
    source,
    cta_text: ctaText,
    destination: "shopify_app_store",
    ...properties,
  });
}

export function trackTryDemoClick(source: string) {
  trackMarketingEvent("try_demo_clicked", { source, destination: "/try" });
}

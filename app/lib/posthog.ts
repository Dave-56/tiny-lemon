import posthog from "posthog-js";
import { isAnalyticsOptedOut } from "./analyticsOptOut";

const SENSITIVE_REPLAY_SELECTOR = [
  "[data-ph-no-capture]",
  ".ph-no-capture",
  "[data-sensitive-media]",
  ".sensitive-media",
].join(",");

let initialized = false;

type PostHogProperties = Record<string, string | number | boolean | null | undefined>;

export function initTinyLemonPostHog() {
  if (typeof window === "undefined" || initialized || isAnalyticsOptedOut()) {
    return initialized;
  }

  const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!posthogKey) {
    return false;
  }

  posthog.init(posthogKey, {
    api_host: "https://us.i.posthog.com",
    defaults: "2026-01-30",
    persistence: "localStorage+cookie",
    capture_pageview: false,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask-text], .ph-mask-text",
      blockSelector: SENSITIVE_REPLAY_SELECTOR,
    },
    loaded: (client) => {
      client.register({ app: "tiny-lemon" });
    },
  });

  initialized = true;
  return true;
}

export function captureTinyLemonPostHogEvent(
  name: string,
  properties: PostHogProperties = {},
) {
  if (!initTinyLemonPostHog()) {
    return;
  }

  try {
    posthog.capture(name, properties);
  } catch {
    // Analytics must never block primary navigation or app actions.
  }
}

export function captureTinyLemonPageview(properties: PostHogProperties = {}) {
  captureTinyLemonPostHogEvent("$pageview", properties);
}

export function identifyTinyLemonShop(
  shop: string,
  properties: PostHogProperties = {},
) {
  if (!initTinyLemonPostHog()) {
    return;
  }

  try {
    posthog.identify(shop, properties);
  } catch {
    // Keep the embedded app usable even if analytics fails to initialize.
  }
}

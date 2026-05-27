export const ANALYTICS_OPT_OUT_STORAGE_KEY = "va-disable";

export function isAnalyticsOptedOut() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

import { useEffect } from "react";
import { useLocation } from "react-router";
import { trackGoogleAnalyticsPageview } from "../lib/googleAnalytics";

export function GoogleAnalytics({ enabled }: { enabled: boolean }) {
  const location = useLocation();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    trackGoogleAnalyticsPageview(`${location.pathname}${location.search}`);
  }, [enabled, location.pathname, location.search]);

  return null;
}

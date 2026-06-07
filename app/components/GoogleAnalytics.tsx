import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { trackGoogleAnalyticsPageview } from "../lib/googleAnalytics";

export function GoogleAnalytics({ enabled }: { enabled: boolean }) {
  const location = useLocation();
  const initialPageviewHandledByGoogleTag = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!initialPageviewHandledByGoogleTag.current) {
      initialPageviewHandledByGoogleTag.current = true;
      return;
    }

    trackGoogleAnalyticsPageview(`${location.pathname}${location.search}`);
  }, [enabled, location.pathname, location.search]);

  return null;
}

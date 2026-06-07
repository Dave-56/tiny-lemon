import { useEffect } from 'react';
import { useLocation } from "react-router";
import {
  captureTinyLemonPageview,
  identifyTinyLemonShop,
} from "../lib/posthog";

export function PostHogProvider({ shop, plan }: { shop: string; plan: string }) {
  const location = useLocation();

  useEffect(() => {
    identifyTinyLemonShop(shop, { plan, app: "tiny-lemon", surface: "app" });
  }, [shop, plan]);

  useEffect(() => {
    captureTinyLemonPageview({
      surface: "app",
      path: location.pathname,
      search: location.search || null,
    });
  }, [location.pathname, location.search]);

  return null;
}

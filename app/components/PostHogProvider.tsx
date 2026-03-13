import { useEffect } from 'react';
import posthog from 'posthog-js';

export function PostHogProvider({ shop, plan }: { shop: string; plan: string }) {
  useEffect(() => {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
      api_host: 'https://us.i.posthog.com',
      persistence: 'localStorage+cookie',
    });
    posthog.identify(shop, { plan });
  }, [shop, plan]);

  return null;
}

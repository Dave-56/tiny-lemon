import { useEffect } from 'react';
import posthog from 'posthog-js';

const SENSITIVE_REPLAY_SELECTOR = [
  "[data-ph-no-capture]",
  ".ph-no-capture",
  "[data-sensitive-media]",
  ".sensitive-media",
].join(",");

export function PostHogProvider({ shop, plan }: { shop: string; plan: string }) {
  useEffect(() => {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
      api_host: 'https://us.i.posthog.com',
      persistence: 'localStorage+cookie',
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask-text], .ph-mask-text",
        blockSelector: SENSITIVE_REPLAY_SELECTOR,
      },
    });
    posthog.identify(shop, { plan, app: "tiny-lemon" });
  }, [shop, plan]);

  return null;
}

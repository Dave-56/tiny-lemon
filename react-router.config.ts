import { vercelPreset } from "@vercel/react-router/vite";
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Only apply Vercel preset on Vercel so local/Shopify dev isn't affected
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;

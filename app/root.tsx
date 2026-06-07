import type { LoaderFunctionArgs } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, redirect, useLocation } from "react-router";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import appCss from "./app.css?url";
import { isAnalyticsOptedOut } from "./lib/analyticsOptOut";
import { GOOGLE_ANALYTICS_ID } from "./lib/googleAnalytics";
import { SITE_URL } from "./lib/seo";

const AHREFS_ANALYTICS_KEY = "kV62qS89ENNF8VlsJaEZog";
const LEGACY_VERCEL_HOSTS = new Set(["tinylemon.vercel.app"]);

export function links() {
  return [{ rel: "stylesheet", href: appCss }];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (LEGACY_VERCEL_HOSTS.has(url.hostname)) {
    throw redirect(`${SITE_URL}${url.pathname}${url.search}`, 301);
  }

  return null;
};

export default function App() {
  const { pathname } = useLocation();
  const isAppRoute = pathname.startsWith("/app");
  const beforeSend = (event: BeforeSendEvent) => {
    if (isAnalyticsOptedOut()) {
      return null;
    }

    return event;
  };

  return (
    <html lang="en">
      <head>
        {!isAppRoute && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${GOOGLE_ANALYTICS_ID}');
                `,
              }}
            />
          </>
        )}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="icon" href="/app-icon-1200x1200.png" type="image/png" />
        <link rel="apple-touch-icon" href="/app-icon-1200x1200.png" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
        {!isAppRoute && (
          <script
            src="https://analytics.ahrefs.com/analytics.js"
            data-key={AHREFS_ANALYTICS_KEY}
            async
          />
        )}
      </head>
      <body>
        <GoogleAnalytics enabled={!isAppRoute} />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        {!isAppRoute && <Analytics beforeSend={beforeSend} />}
      </body>
    </html>
  );
}

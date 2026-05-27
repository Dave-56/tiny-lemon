import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import appCss from "./app.css?url";
import { isAnalyticsOptedOut } from "./lib/analyticsOptOut";

export function links() {
  return [{ rel: "stylesheet", href: appCss }];
}

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
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
        {!isAppRoute && <Analytics beforeSend={beforeSend} />}
      </body>
    </html>
  );
}

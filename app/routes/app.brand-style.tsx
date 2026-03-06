import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Authentication handled by parent layout (app.tsx)
export const loader = async (_: LoaderFunctionArgs) => {
  return null;
};

export default function BrandStyle() {
  return (
    <s-page heading="Brand style">
      <div className="p-6 text-center text-gray-400">
        Brand style settings coming soon.
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

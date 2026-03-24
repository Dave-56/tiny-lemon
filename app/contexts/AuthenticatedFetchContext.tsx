import { createContext, useCallback, useContext, useMemo } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { fetchWithShopifyAuth } from "../lib/authenticatedRequest.client";

type AuthenticatedFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

const AuthenticatedFetchContext = createContext<AuthenticatedFetch | null>(
  null
);

/**
 * Provider that supplies an authenticated fetch function for /app/* requests.
 * Uses Shopify App Bridge idToken so requests work in the embedded iframe
 * when third-party cookies are blocked.
 * Must be rendered inside AppProvider (embedded) so useAppBridge() is available.
 */
export function AuthenticatedFetchProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const shopify = useAppBridge();

  const authenticatedFetch = useCallback<AuthenticatedFetch>(
    async (input, init = {}) => {
      return fetchWithShopifyAuth({
        getToken: () => shopify.idToken(),
        input,
        init,
      });
    },
    [shopify]
  );

  const value = useMemo(
    () => authenticatedFetch,
    [authenticatedFetch]
  );

  return (
    <AuthenticatedFetchContext.Provider value={value}>
      {children}
    </AuthenticatedFetchContext.Provider>
  );
}

export function useAuthenticatedFetch(): AuthenticatedFetch {
  const fetchFn = useContext(AuthenticatedFetchContext);
  if (!fetchFn) {
    throw new Error(
      "useAuthenticatedFetch must be used within AuthenticatedFetchProvider"
    );
  }
  return fetchFn;
}

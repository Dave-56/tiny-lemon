import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import prisma from "./db.server";
import { RecoverablePrismaSessionStorage } from "./lib/recoverablePrismaSessionStorage.server";
import { BILLING_PLANS } from "./lib/plans";
export { BILLING_PLANS };

function createShopify() {
  return shopifyApp({
    apiKey: process.env.SHOPIFY_API_KEY?.trim(),
    apiSecretKey: process.env.SHOPIFY_API_SECRET?.trim() || "",
    apiVersion: ApiVersion.April26,
    scopes: process.env.SCOPES?.split(",").map((scope) => scope.trim()).filter(Boolean),
    appUrl: process.env.SHOPIFY_APP_URL?.trim() || "",
    authPathPrefix: "/auth",
    sessionStorage: new RecoverablePrismaSessionStorage(prisma, {
      connectionRetries: 8,
      connectionRetryIntervalMs: 2_500,
    }),
    distribution: AppDistribution.AppStore,
    future: {
      expiringOfflineAccessTokens: true,
    },
    billing: {
      [BILLING_PLANS.Starter]: {
        lineItems: [{ amount: 39, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      },
      [BILLING_PLANS.Growth]: {
        lineItems: [{ amount: 99, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      },
      [BILLING_PLANS.Scale]: {
        lineItems: [{ amount: 249, currencyCode: "USD", interval: BillingInterval.Every30Days }],
      },
    },
    ...(process.env.SHOP_CUSTOM_DOMAIN
      ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
      : {}),
  });
}

type ShopifyApp = ReturnType<typeof createShopify>;

let shopify: ShopifyApp | undefined;

function getShopify() {
  shopify ??= createShopify();

  return shopify;
}

function lazyObject<T extends object>(getTarget: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const target = getTarget();
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

const shopifyProxy = lazyObject(getShopify);

export default shopifyProxy;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders: ShopifyApp["addDocumentResponseHeaders"] = (
  request,
  headers,
) => getShopify().addDocumentResponseHeaders(request, headers);
export const authenticate = lazyObject(() => getShopify().authenticate);
export const unauthenticated = lazyObject(() => getShopify().unauthenticated);
export const login: ShopifyApp["login"] = (request) => getShopify().login(request);
export const registerWebhooks: ShopifyApp["registerWebhooks"] = (options) =>
  getShopify().registerWebhooks(options);
export const sessionStorage = lazyObject(() => getShopify().sessionStorage);

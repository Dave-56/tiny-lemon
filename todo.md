# Tiny Lemon — TODO

## Billing
- [x] Define plan constants (`plans.ts`)
- [x] Configure billing in `shopify.server.ts` (Starter $39, Growth $99, Scale $249)
- [x] Billing page UI (`app.billing.tsx`) — usage meter + plan cards
- [x] Usage gating with serializable transaction (`billing.server.ts`)
- [x] Webhook handler for subscription events (`webhooks.app_subscriptions.update.tsx`)
- [x] DB schema — `Shop.plan` + `CreditTransaction` model + migrations
- [x] Set app distribution to Public in Partners Dashboard (required for Billing API)

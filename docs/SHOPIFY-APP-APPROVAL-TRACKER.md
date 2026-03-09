# Shopify App Store approval tracker

Succinct checklist for submitting **tiny-lemon** to the Shopify App Store.

---

## Where to apply

- **Partner Dashboard:** [partners.shopify.com](https://partners.shopify.com/) → Apps → your app
- **App Store review flow:** In the app’s page, use **“App submission”** / **“App Store review”** (progress is auto-saved)
- **Docs:** [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review) | [App Store requirements](https://shopify.dev/docs/apps/store/requirements)
- **Review contact:** Add `app-submissions@shopify.com` and `noreply@shopify.com` to allowed senders so you get review emails. Reply from the **submission contact email** you set in the listing.

**Review time:** typically 5–10 business days.

---

## Submission checklist

### Configuration (Partner Dashboard / App setup)

| Requirement | Status | Notes |
|-------------|--------|--------|
| Emergency contact (email + phone) | ⬜ | Set in Partner Dashboard / app configuration |
| App icon 1200×1200 (JPEG or PNG) | ⬜ | In app configuration |
| Application URL (no “Shopify” or “Example”) | ✅ | `https://tinylemon.vercel.app` |
| API contact email (no “Shopify”) | ⬜ | Set in app configuration |
| Compliance webhooks subscribed | 🔶 | Handlers exist; must be **registered in `shopify.app.toml`** (see below) |

### Compliance webhooks (required for App Store)

Apps must subscribe to these three topics and respond with 2xx:

- `customers/data_request`
- `customers/redact`
- `shop/redact`

**Current state:** Route handlers exist (`webhooks.customers.data_request.tsx`, `webhooks.customers.redact.tsx`, `webhooks.shop.redact.tsx`). Add the three subscriptions in `shopify.app.toml` so Shopify sends events to your app (see “Gaps” below).

### App listing (at least one, primary language)

| Item | Status |
|------|--------|
| Primary language | ⬜ |
| Name, description, features | ⬜ |
| Pricing (if paid) | ⬜ |
| Support / contact info | ⬜ |
| Screenshots / media per listing requirements | ⬜ |

### Technical / policy

| Requirement | Status | Notes |
|-------------|--------|--------|
| Session tokens (embedded app) | ✅ | Using session tokens |
| Shopify Billing API for charges | ✅ | `app.billing` + Billing API |
| OAuth + redirect to app UI after install | ✅ | Standard flow |
| No 404/500/300 during review | ⬜ | Test on dev store |
| TLS/HTTPS | ✅ | Vercel |
| Compliance webhooks return 2xx | ✅ | Handlers return 200 |

### Before you submit

- [ ] Install and test on a **development store** (full install → use core flows → billing if applicable)
- [ ] Run **automated checks** on the App Store review page (fix any failures)
- [ ] Complete **App requirements checklist** on the review page
- [ ] No “Shopify” or “Example” in URLs or API contact email

---

## Gaps to fix

1. **Compliance webhooks in `shopify.app.toml`**  
   Add these subscriptions (URIs must match your route paths, e.g. `/webhooks/customers/redact`):

   ```toml
   [[webhooks.subscriptions]]
   topics = [ "customers/data_request" ]
   uri = "/webhooks/customers/data_request"

   [[webhooks.subscriptions]]
   topics = [ "customers/redact" ]
   uri = "/webhooks/customers/redact"

   [[webhooks.subscriptions]]
   topics = [ "shop/redact" ]
   uri = "/webhooks/shop/redact"
   ```

2. **Partner Dashboard:** Emergency contact, app icon 1200×1200, API contact email, and full listing (language, copy, pricing, support).

3. **Protected customer data:** If the app does **not** use [protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data), opt out on the review page. If it does, request access (not while the app is under review).

---

## Useful links

- [Submit your app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- [App Store requirements](https://shopify.dev/docs/apps/store/requirements)
- [Pass app review](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)
- [Compliance webhooks (privacy)](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [Partner support](https://help.shopify.com/en/partners/about#partner-support)

---

*Last updated: 2025-03-09*

# Landing page deep dive: before & after (revised)

## What you have (BEFORE)

**Location:** `app/routes/_index/route.tsx` + `app/routes/_index/styles.module.css`

### Structure
- **Header:** Logo "Tiny Lemon", nav "Log in", actions "Get started" + "Log in" (only when `showForm` is true).
- **Hero:** One block — label, headline, subhead, single CTA "Get started".
- **Features:** One card ("Professional product photos") with title, description, 3 bullet points, "Try it in the app" link.
- **Login:** Shop domain form (post to `/auth/login`) when `showForm` is true.
- **Footer:** Privacy + Terms only.

### Content
- **Hero:** "For Shopify fashion brands" → "Turn flat-lays into studio shots in 60 seconds." → no photographer/model/$15K, front/3/4/back angles.
- **Feature:** Repeats the same value prop (flat-lay → studio, angles, Shopify) in longer form.
- No social proof, no pricing, no "how it works," no visuals of the product.

### Design
- **Krea-style:** Light background (`#fafafa`), white cards, black accent, gray muted text.
- **Typography:** No font set in the landing CSS; root loads Shopify Inter. Rest of app uses Inter + Space Grotesk from `app.css` — landing can feel slightly disconnected.
- **Layout:** Centered, single column, max-width 42rem (hero) / 56rem (features). Sticky header, basic responsive rules in the CSS.
- **No imagery:** No photos, illustrations, or screenshots anywhere.

### UX / conversion
- CTAs are all "Get started" / "Log in" / "Try it in the app" → same action, no hierarchy or journey.
- Login is at bottom in a separate section; no sticky or secondary CTA in the hero.
- No clear "how it works" (steps or flow).
- No trust elements (logos, testimonials, "as seen in").
- No before/after visual of your core promise (flat-lay → studio shot).

### Technical
- Loader redirects `?shop=...` to `/app`; otherwise returns `showForm: Boolean(login)`.
- Form is plain HTML form to `/auth/login`; no client-side validation or loading state.
- No meta description or OG tags in the route (relies on root `<Meta />`).

---

## What would make it stronger (AFTER)

A proper "before and after" on the page means **two things**: (1) a literal **before/after visual** of your product, and (2) a clearer **before/after of the visitor's situation** (before Tiny Lemon vs after). Both are missing today.

### 1. Add a before/after slider (high impact)

**Current:** You say "flat-lays into studio shots" but don't show it.

**After:** Add a **before/after slider** directly under the hero:
- **Before:** One flat-lay product photo.
- **After:** Same product as a studio shot (e.g. one hero angle — front or 3/4).
- **Implementation:** Draggable slider (slide left = before, slide right = after). Keep it simple: one component or a small library; optional fallback to static side-by-side for `prefers-reduced-motion` or when images haven't loaded.
- **Placement:** Right under the hero so the value prop is proven in a few seconds.

This is the main "before and after" improvement for both the product and the page.

### 2. Clarify information hierarchy

**Current:** One hero CTA, one feature card, then login. All CTAs do the same thing.

**After:**
- **Hero:** One primary CTA ("Start free" or "Connect your store") that scrolls to login or goes to install flow; one secondary ("See how it works" → scroll to steps or demo).
- **Features:** Either 2–3 short cards (e.g. "Upload flat-lays", "Get studio angles", "Publish to Shopify") or keep one card but add a "How it works" section with 3 steps and optional thumbnails.
- **Login:** Keep as-is but make it the obvious "already have the app?" block; consider a second CTA in the header or a floating bar on scroll so returning users don't have to scroll to the bottom.

### 3. Add social proof and trust

**Current:** No testimonials, logos, or numbers.

**After:**
- Short quote + name/store (even 1–2 to start).
- "X stores" or "X images generated" if you have the number.
- If you're in Shopify's ecosystem, "Available in the Shopify App Store" (and badge) when applicable.

### 4. Differentiate hero and feature copy (with GTM lens)

**Current:** Hero and feature card say almost the same thing.

**After:**
- **Hero:** Lead with outcome and time ("Studio shots in 60 seconds") and one line on who it's for. Speak to what Shopify fashion brands care about: **speed** (minutes, not weeks), **cost** (no photographer, no $15K shoot), **consistency** (same model, same look), **ease** (built for Shopify).
- **Feature block:** Focus on *how* (upload → we generate angles → you add to products) or on benefits (consistent model, no shoot, built for Shopify). Avoid repeating the same sentence as the hero.

### 5. Design and polish

**Current:** No images; generic SaaS look; font not explicit on landing.

**After:**
- **Font:** Set font-family on the landing page (e.g. use `--font-display` for headline and `--font-sans` for body from `app.css`) so it matches the app and feels intentional.
- **Visual:** At minimum: the before/after slider. Optionally: a small product UI screenshot (e.g. "Dress Model" or "Outfits" screen) or a simple illustration.
- **Depth:** Subtle gradient in hero background or a soft grid/shape so it doesn't feel like a single flat block; keep it minimal so the before/after stays the focus.

### 6. SEO and shareability

**Current:** No route-level meta.

**After:** In the route (or parent layout), add:
- `meta name="description"` with the 60-second / flat-lay → studio shot value prop.
- OG title and description (and image, ideally a before/after or app screenshot) so shares look good.

### 7. Small UX tweaks

- **Form:** Add `required` and/or `pattern` for the shop domain; optional client-side validation and a "Logging in…" state on submit.
- **Footer:** Consider "Pricing" (or "Plans") and "Contact" or "Support" if you have them; keeps the page from feeling like a dead end.
- **Accessibility:** Ensure hero and feature headings use a logical order (e.g. one `<h1>`, then `<h2>` for feature/login); CTAs have clear, distinct labels; slider supports keyboard and has a reduced-motion fallback.

---

## Before vs after summary

| Area              | Before                         | After (recommended)                          |
|-------------------|--------------------------------|----------------------------------------------|
| **Proof**         | No visuals                     | Before/after **slider** (flat-lay → studio shot) |
| **Trust**         | None                           | 1–2 testimonials or stats + optional badge   |
| **Clarity**       | One long feature block         | Short "How it works" (3 steps) + clearer CTAs|
| **Copy**          | Hero + feature say the same    | Hero = outcome + GTM (speed, cost, consistency, ease); feature = how / benefits |
| **Design**        | Text-only, generic             | Font + before/after slider (+ optional gradient) |
| **Conversion**    | Single CTA type, login at bottom | Primary + secondary CTA; login easier to find |
| **SEO / share**   | Default meta                   | Description + OG with before/after or screenshot |

---

## Implementation order

1. **Before/after slider** under the hero (with one before + one after asset).
2. **Copy pass** on hero and feature (GTM angles, no repetition).
3. **CTA hierarchy** (primary + "See how it works").
4. **Font + minimal design polish** on the landing.
5. **Meta + OG** for SEO and sharing.
6. **Form + footer + a11y** tweaks.

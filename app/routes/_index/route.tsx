import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, Link, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { BeforeAfterSlider } from "../../components/BeforeAfterSlider";

import styles from "./styles.module.css";

const LANDING_1 = { before: "/landing-before.png", after: "/landing-after.png" };
const LANDING_2 = {
  before: "/landing-before-1.png",
  after: "/landing-after-1.png",
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = "Tiny Lemon: Studio shots from flat-lays in 60 seconds";
  const description =
    "Turn flat-lays into studio shots in 60 seconds. Upload from your factory or your own shoot — get professional on-model photos, ready for your Shopify store.";
  const ogImage = data?.origin ? `${data.origin}/app-icon-1200x1200.png` : undefined;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const installUrl = process.env.SHOPIFY_APP_INSTALL_URL ?? "";
  const origin = new URL(request.url).origin;
  return { showForm: Boolean(login), installUrl, origin };
};

function normalizeShopDomain(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
  if (!trimmed) return "";
  if (trimmed.endsWith(".myshopify.com")) return trimmed;
  if (trimmed.includes(".myshopify.com")) return trimmed;
  return `${trimmed.replace(/\.myshopify\.com$/i, "")}.myshopify.com`;
}

export default function LandingPage() {
  const { showForm, installUrl } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <div className={styles.headerWrapper}>
        <header className={styles.header}>
          <a href="/" className={styles.logo} aria-label="Tiny Lemon home">
            <img src="/app-icon-1200x1200.png" alt="" className={styles.logoIcon} width={32} height={32} />
            <span>TinyLemon</span>
          </a>
          <nav className={styles.nav} aria-label="Main">
            <a href="#features" className={styles.navLink}>
              Features
            </a>
            <Link to="/pricing" className={styles.navLink}>
              Pricing
            </Link>
            <Link to="/blog" className={styles.navLink}>
              Blog
            </Link>
            <a href="#how-it-works" className={styles.navLink}>
              About
            </a>
            <a href="#login" className={styles.navLink}>
              Contact
            </a>
            {showForm && (
              <a href="#login" className={styles.navLink}>
                Log in
              </a>
            )}
          </nav>
          <div className={styles.headerActions}>
            <Link to="/try" className={styles.btnPrimary}>
              Try free
            </Link>
            {showForm && (
              <a
                href={installUrl || "#login"}
                {...(installUrl
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={styles.btnPrimary}
              >
                Get started
              </a>
            )}
          </div>
        </header>
      </div>

      <main>
        <section className={styles.hero}>
          <p className={styles.heroLabel}>For indie fashion brands on Shopify</p>
          <h1 className={styles.heroHeadline}>
            Studio shots in 60 seconds. No shoot.
          </h1>
          <p className={styles.heroSubhead}>
            Upload a flat-lay from your factory or your own shoot. Get
            professional on-model photos, ready to publish on Shopify. No
            photographer, no shoot budget.
          </p>
          <div className={styles.heroCtas}>
            <Link to="/try" className={styles.heroCta}>
              Try free
            </Link>
            {showForm && (
              <a
                href={installUrl || "/auth/login"}
                {...(installUrl
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className={styles.heroCtaSecondary}
              >
                Add to Shopify
              </a>
            )}
          </div>
        </section>

        <section className={styles.sliderSection}>
          <p className={styles.sliderHint}>Drag to compare</p>
          <div className={styles.sliderGrid}>
            <BeforeAfterSlider
              beforeImage={LANDING_1.before}
              afterImage={LANDING_1.after}
              beforeLabel="Flat lay"
              afterLabel="Studio shot"
            />
            <BeforeAfterSlider
              beforeImage={LANDING_2.before}
              afterImage={LANDING_2.after}
              beforeLabel="Flat lay"
              afterLabel="Studio shot"
            />
          </div>
        </section>

        <section id="how-it-works" className={styles.howItWorks}>
          <h2 className={styles.howItWorksTitle}>How it works</h2>
          <ol className={styles.howItWorksList}>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>1</span>
              <span>Upload your flat-lay — from your factory, supplier, or your own shoot</span>
            </li>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>2</span>
              <span>Get a full set of on-model photos in minutes</span>
            </li>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>3</span>
              <span>Add to your Shopify products and publish</span>
            </li>
          </ol>
        </section>

        <section id="features" className={styles.featuresSection}>
          <h2 className={styles.featuresSectionTitle}>
            All features in 1 tool
          </h2>
          <p className={styles.featuresSectionSubtitle}>
            Discover features that simplify workflows and grow your business.
          </p>
          <div className={styles.featuresGrid}>
            <div className={styles.featureCardGrid}>
              <img
                src="/Flat-lay-to-studio-in-minutes-1600x900.png"
                alt="Flat-lay garment transformed into a professional studio on-model shot"
                className={styles.featureCardImage}
                width={1600}
                height={900}
              />
              <div className={styles.featureCardIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
              </div>
              <h3 className={styles.featureCardTitle}>Flat-lay to studio in minutes</h3>
              <p className={styles.featureCardDesc}>
                Upload a flat-lay photo. We generate on-model shots so the product looks the same as in real life, fabric, fit, and construction, without a photoshoot.
              </p>
            </div>
            <div className={styles.featureCardGrid}>
              <img
                src="/built-for-shopify-1600x900.png"
                alt="Generating images directly inside Shopify product pages"
                className={styles.featureCardImage}
                width={1600}
                height={900}
              />
              <div className={styles.featureCardIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </div>
              <h3 className={styles.featureCardTitle}>Built for Shopify</h3>
              <p className={styles.featureCardDesc}>
                Generate images in the app and add them directly to your Shopify products. No export, no manual uploads, same look every time.
              </p>
            </div>
            <div className={styles.featureCardGrid}>
              <img
                src="/your-model-your-style-1600x900.png"
                alt="Custom brand model in a styled studio shot matching your aesthetic"
                className={styles.featureCardImage}
                width={1600}
                height={900}
              />
              <div className={styles.featureCardIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </div>
              <h3 className={styles.featureCardTitle}>Your model, your style</h3>
              <p className={styles.featureCardDesc}>
                Pick a styling direction that matches your brand — Editorial Cool (Zara, Reformation), Minimal Clarity (COS, Arket), Street Aesthetic (Urban Outfitters, Carhartt), and more. Every shot reflects your brand identity, not a generic template.
              </p>
            </div>
            <div className={styles.featureCardGrid}>
              <img
                src="/every-photo-your-listing-needs-1600x900.png"
                alt="Multiple product image types: on-model angles, detail close-ups, flat lay, and lifestyle"
                className={styles.featureCardImage}
                width={1600}
                height={900}
              />
              <div className={styles.featureCardIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <h3 className={styles.featureCardTitle}>Every photo your listing needs</h3>
              <p className={styles.featureCardDesc}>
                On-model front, side, and back views, detail close-ups, flat lay, and lifestyle. Each tier unlocks more of the set for your store.
              </p>
            </div>
          </div>
        </section>

        <section id="login" className={styles.loginSection}>
          <h2 className={styles.loginTitle}>Get started</h2>
          <p className={styles.loginSubtext}>
            New to Tiny Lemon? Add the app to your store. Already use it? Log in
            below.
          </p>
          {showForm && (
            <a
              href={installUrl || "/auth/login"}
              {...(installUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={styles.loginPrimaryCta}
            >
              Add the app to my store
            </a>
          )}
          {showForm && (
            <>
              <p className={styles.loginDivider}>Already have the app?</p>
              <Form
                className={styles.form}
                method="post"
                action="/auth/login"
                onSubmit={(e) => {
                  const form = e.currentTarget;
                  const shopInput = form.querySelector<HTMLInputElement>('input[name="shop"]');
                  if (shopInput?.value) {
                    shopInput.value = normalizeShopDomain(shopInput.value);
                  }
                }}
              >
                <label className={styles.label}>
                  <span className={styles.labelText}>Shop domain</span>
                  <input
                    className={styles.input}
                    type="text"
                    name="shop"
                    placeholder="my-store.myshopify.com"
                    required
                    pattern="[a-z0-9][a-z0-9-]*\.myshopify\.com"
                    title="Enter your Shopify store domain (e.g. my-store.myshopify.com)"
                  />
                </label>
                <button type="submit" className={styles.btnGhost}>
                  Log in
                </button>
              </Form>
            </>
          )}
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <a href="/" className={styles.footerLogo} aria-label="Tiny Lemon home">
              <img src="/app-icon-1200x1200.png" alt="" className={styles.footerLogoIcon} width={28} height={28} />
              <span>TinyLemon</span>
            </a>
            <p className={styles.footerTagline}>
              Beautiful product photos in minutes. For fashion brands on
              Shopify.
            </p>
          </div>
          <div className={styles.footerColumns}>
            <div className={styles.footerCol}>
              <h3 className={styles.footerHeading}>Product</h3>
              <Link to="/try" className={styles.footerLink}>
                Try free
              </Link>
              <a href="#features" className={styles.footerLink}>
                Features
              </a>
              <Link to="/pricing" className={styles.footerLink}>
                Pricing
              </Link>
              <a href="#login" className={styles.footerLink}>
                Contact
              </a>
            </div>
            <div className={styles.footerCol}>
              <h3 className={styles.footerHeading}>Company</h3>
              <Link to="/blog" className={styles.footerLink}>
                Blog
              </Link>
              <a href="#how-it-works" className={styles.footerLink}>
                About
              </a>
              <a href="#login" className={styles.footerLink}>
                Contact
              </a>
            </div>
            <div className={styles.footerCol}>
              <h3 className={styles.footerHeading}>Legal</h3>
              <a href="/privacy" className={styles.footerLink}>
                Privacy Policy
              </a>
              <a href="/terms" className={styles.footerLink}>
                Terms of Use
              </a>
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span className={styles.footerCopyright}>
            © {new Date().getFullYear()} TinyLemon.
          </span>
          <div className={styles.footerSocial}>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="X (Twitter)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="LinkedIn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="Instagram"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

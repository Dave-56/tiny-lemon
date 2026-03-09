import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { BeforeAfterSlider } from "../../components/BeforeAfterSlider";

import styles from "./styles.module.css";

const LANDING_1 = { before: "/landing-before.png", after: "/landing-after.png" };
const LANDING_2 = {
  before: "/landing-before-1.png",
  after: "/landing-after-1.png",
};

export const meta: MetaFunction = () => {
  const title = "Tiny Lemon: Studio shots from flat-lays in 60 seconds";
  const description =
    "Turn flat-lays into studio shots in 60 seconds. No photographer, no $15K shoot. Front, 3/4, and back angles for your Shopify fashion store.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function LandingPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <div className={styles.headerWrapper}>
        <header className={styles.header}>
          <a href="/" className={styles.logo}>
            TinyLemon
          </a>
          <nav className={styles.nav} aria-label="Main">
            <a href="#how-it-works" className={styles.navLink}>
              Features
            </a>
            <a href="#pricing" className={styles.navLink}>
              Pricing
            </a>
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
            {showForm && (
              <a href="#login" className={styles.btnPrimary}>
                Get started
              </a>
            )}
          </div>
        </header>
      </div>

      <main>
        <section className={styles.hero}>
          <p className={styles.heroLabel}>For Shopify fashion brands</p>
          <h1 className={styles.heroHeadline}>
            Studio shots in 60 seconds. No shoot.
          </h1>
          <p className={styles.heroSubhead}>
            Turn flat-lays into consistent, on-model photos. Same look every
            time, built for your Shopify store. No photographer, no $15K
            photoshoot.
          </p>
          {showForm && (
            <div className={styles.heroCtas}>
              <a href="#login" className={styles.heroCta}>
                Connect your store
              </a>
              <a href="#how-it-works" className={styles.heroCtaSecondary}>
                See how it works
              </a>
            </div>
          )}
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
              <span>Upload your flat-lay product images</span>
            </li>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>2</span>
              <span>Get front, 3/4, and back angles in minutes</span>
            </li>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>3</span>
              <span>Add to your Shopify products and publish</span>
            </li>
          </ol>
        </section>

        <section id="pricing" className={styles.features}>
          <div className={styles.featureCard}>
            <h2 className={styles.featureTitle}>
              One consistent look across your catalog
            </h2>
            <p className={styles.featureDesc}>
              Same model, same background. Every product fits the same brand
              look. Garment-accurate output that’s ready for your store. No
              waiting weeks for a shoot.
            </p>
            <ul className={styles.featureList}>
              <li>Studio-quality angles in minutes, not weeks</li>
              <li>Built for Shopify. Generate and add to your products</li>
              <li>No photographer, no model booking, no shoot day</li>
            </ul>
            {showForm && (
              <a href="#login" className={styles.featureCta}>
                Try it in the app
              </a>
            )}
          </div>
        </section>

        {showForm && (
          <section id="login" className={styles.loginSection}>
            <h2 className={styles.loginTitle}>Already have the app?</h2>
            <Form
              className={styles.form}
              method="post"
              action="/auth/login"
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
              <button type="submit" className={styles.btnPrimary}>
                Log in
              </button>
            </Form>
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <a href="/" className={styles.footerLogo}>
              TinyLemon
            </a>
            <p className={styles.footerTagline}>
              Studio-quality product angles in minutes. Built for Shopify
              fashion brands.
            </p>
          </div>
          <div className={styles.footerColumns}>
            <div className={styles.footerCol}>
              <h3 className={styles.footerHeading}>Product</h3>
              <a href="#how-it-works" className={styles.footerLink}>
                Features
              </a>
              <a href="#pricing" className={styles.footerLink}>
                Pricing
              </a>
              <a href="#login" className={styles.footerLink}>
                Contact
              </a>
            </div>
            <div className={styles.footerCol}>
              <h3 className={styles.footerHeading}>Company</h3>
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

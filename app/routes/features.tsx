import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

import { login } from "../shopify.server";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/features.module.css";

export const meta: MetaFunction = () => {
  const title = "Features — TinyLemon";
  const description =
    "Turn flat-lays into studio shots in minutes. Front, 3/4, and back angles. Built for Shopify fashion brands. No photographer, no shoot.";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
};

export const loader = async (_args: LoaderFunctionArgs) => {
  return { showForm: Boolean(login) };
};

export default function FeaturesPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={landingStyles.page}>
      <div className={landingStyles.headerWrapper}>
        <header className={landingStyles.header}>
          <Link to="/" className={landingStyles.logo}>
            TinyLemon
          </Link>
          <nav className={landingStyles.nav} aria-label="Main">
            <Link to="/try" className={landingStyles.navLink}>
              Try free
            </Link>
            <Link to="/#features" className={landingStyles.navLink}>
              Features
            </Link>
            <Link to="/pricing" className={landingStyles.navLink}>
              Pricing
            </Link>
            <Link to="/blog" className={landingStyles.navLink}>
              Blog
            </Link>
            <Link to="/#how-it-works" className={landingStyles.navLink}>
              About
            </Link>
            <Link to="/#login" className={landingStyles.navLink}>
              Contact
            </Link>
            {showForm && (
              <Link to="/#login" className={landingStyles.navLink}>
                Log in
              </Link>
            )}
          </nav>
          <div className={landingStyles.headerActions}>
            {showForm && (
              <Link to="/#login" className={landingStyles.btnPrimary}>
                Get started
              </Link>
            )}
          </div>
        </header>
      </div>

      <main>
        <section className={styles.section}>
          <h1 className={styles.pageTitle}>Features</h1>
          <p className={styles.subtitle}>
            Studio-quality product angles in minutes, not weeks. Built for
            Shopify fashion brands. No photographer, no model booking, no shoot
            day.
          </p>

          <div className={styles.howItWorks}>
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
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              <h2 className={styles.featureTitle}>
                Flat-lay to studio in minutes
              </h2>
              <p className={styles.featureDesc}>
                Upload a flat-lay photo of your garment. We generate on-model
                shots so the product looks the same as in real life — fabric,
                fit, and construction — without a photoshoot.
              </p>
              <ul className={styles.featureList}>
                <li>Front, three-quarter, and back angles (structural set)</li>
                <li>Garment-accurate output, ready for your store</li>
                <li>One consistent look across your catalog</li>
                <li>Higher tiers: detail close-up, flat lay, and lifestyle</li>
              </ul>
            </div>

            <div className={styles.featureCard}>
              <h2 className={styles.featureTitle}>Built for Shopify</h2>
              <p className={styles.featureDesc}>
                Generate images inside the app and add them directly to your
                Shopify products. No export, no manual uploads, no broken
                workflows.
              </p>
              <ul className={styles.featureList}>
                <li>Generate and attach images to products in one place</li>
                <li>Download individual images or full sets when you need them</li>
                <li>Same look every time — same model, same background</li>
              </ul>
            </div>

            <div className={styles.featureCard}>
              <h2 className={styles.featureTitle}>Your model, your style</h2>
              <p className={styles.featureDesc}>
                Create custom models in the Model Builder and pick a brand style
                so every shot matches your aesthetic. Choose from studio
                backgrounds (white, grey) and styling directions based on the
                Fashion PDP Visual Framework.
              </p>
              <ul className={styles.featureList}>
                <li>Custom models — build and save models that represent your brand</li>
                <li>Brand style profiles — Minimal, Accessible, Editorial, Premium, Street, Athletic</li>
                <li>White and grey studio backgrounds (more at higher tiers)</li>
                <li>Regenerate with custom direction when you want a tweak</li>
              </ul>
            </div>

            <div className={styles.featureCard}>
              <h2 className={styles.featureTitle}>Multiple angles & image types</h2>
              <p className={styles.featureDesc}>
                The image set follows a clear hierarchy: structural angles
                first (front, 3/4, back), then detail and flat lay, then
                lifestyle. Each tier unlocks more of the set.
              </p>
              <ul className={styles.featureList}>
                <li>Structural set: front hero, three-quarter (45°), back</li>
                <li>Detail close-up: fabric, stitching, hardware (Growth+)</li>
                <li>Flat lay: garment construction view (Growth+)</li>
                <li>Lifestyle: model in context (Scale+)</li>
              </ul>
            </div>

            <div className={styles.featureCard}>
              <h2 className={styles.featureTitle}>No shoot, no wait</h2>
              <p className={styles.featureDesc}>
                Skip the photographer, model booking, and shoot day. Get
                studio-quality angles in minutes instead of weeks.
              </p>
              <ul className={styles.featureList}>
                <li>Studio-quality angles in minutes, not weeks</li>
                <li>No photographer, no model booking, no shoot day</li>
                <li>Output that&apos;s ready for your store — no waiting for a shoot</li>
              </ul>
            </div>
          </div>

          <div className={styles.anglesSection}>
            <h2 className={styles.anglesTitle}>What you get by tier</h2>
            <p className={styles.anglesDesc}>
              Free proves quality with one front angle. Starter unlocks the
              full 3-angle structural set. Growth adds detail + flat lay.
              Scale adds lifestyle. See{" "}
              <Link to="/pricing" className={styles.inlineLink}>
                Pricing
              </Link>{" "}
              for full details.
            </p>
            <ul className={styles.anglesList}>
              <li>
                <span>Free</span>
                <strong>Front hero only</strong>
              </li>
              <li>
                <span>Starter</span>
                <strong>Front + 3/4 + Back (3 images)</strong>
              </li>
              <li>
                <span>Growth</span>
                <strong>+ Detail close-up + Flat lay (5 images)</strong>
              </li>
              <li>
                <span>Scale</span>
                <strong>+ Lifestyle (7–8 images)</strong>
              </li>
            </ul>
          </div>
        </section>
      </main>

      <footer className={landingStyles.footer}>
        <div className={landingStyles.footerTop}>
          <div className={landingStyles.footerBrand}>
            <Link to="/" className={landingStyles.footerLogo}>
              TinyLemon
            </Link>
            <p className={landingStyles.footerTagline}>
              Studio-quality product angles in minutes. Built for Shopify
              fashion brands.
            </p>
          </div>
          <div className={landingStyles.footerColumns}>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Product</h3>
              <Link to="/try" className={landingStyles.footerLink}>
                Try free
              </Link>
              <Link to="/#features" className={landingStyles.footerLink}>
                Features
              </Link>
              <Link to="/pricing" className={landingStyles.footerLink}>
                Pricing
              </Link>
              <Link to="/#login" className={landingStyles.footerLink}>
                Contact
              </Link>
            </div>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Company</h3>
              <Link to="/blog" className={landingStyles.footerLink}>
                Blog
              </Link>
              <Link to="/#how-it-works" className={landingStyles.footerLink}>
                About
              </Link>
              <Link to="/#login" className={landingStyles.footerLink}>
                Contact
              </Link>
            </div>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Legal</h3>
              <Link to="/privacy" className={landingStyles.footerLink}>
                Privacy Policy
              </Link>
              <Link to="/terms" className={landingStyles.footerLink}>
                Terms of Use
              </Link>
            </div>
          </div>
        </div>
        <div className={landingStyles.footerBottom}>
          <span className={landingStyles.footerCopyright}>
            © {new Date().getFullYear()} TinyLemon.
          </span>
          <div className={landingStyles.footerSocial}>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className={landingStyles.footerSocialLink}
              aria-label="X (Twitter)"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              className={landingStyles.footerSocialLink}
              aria-label="LinkedIn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              className={landingStyles.footerSocialLink}
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

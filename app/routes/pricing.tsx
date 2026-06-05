import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

import { SHOPIFY_APP_STORE_URL } from "../lib/shopifyAppStoreUrl";
import {
  BETA_LAUNCH_GENERATION_CAP,
  FREE_PLAN_GENERATION_LIMIT,
} from "../lib/planConstants";
import { buildSeoMeta } from "../lib/seo";
import {
  trackMarketingEvent,
  trackShopifyAppStoreClick,
  trackTryDemoClick,
} from "../lib/marketingAnalytics";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/pricing.module.css";

export const meta: MetaFunction = () => {
  const title = `AI Fashion Pricing: ${BETA_LAUNCH_GENERATION_CAP} Free Generations | TinyLemon`;
  const description =
    `TinyLemon pricing for Shopify fashion brands. Start with up to ${BETA_LAUNCH_GENERATION_CAP} launch generations for AI model photos and short product videos.`;
  return buildSeoMeta({ title, description, path: "/pricing" });
};

export const loader = async (_args: LoaderFunctionArgs) => {
  return { showForm: Boolean(SHOPIFY_APP_STORE_URL) };
};

export default function PricingPage() {
  const { showForm } = useLoaderData<typeof loader>();

  useEffect(() => {
    trackMarketingEvent("pricing_viewed");
  }, []);

  return (
    <div className={landingStyles.page}>
      <div className={landingStyles.headerWrapper}>
        <header className={landingStyles.header}>
          <Link to="/" className={landingStyles.logo} aria-label="Tiny Lemon home">
            <img src="/app-icon-1200x1200.png" alt="" className={landingStyles.logoIcon} width={32} height={32} />
            <span>TinyLemon</span>
          </Link>
          <nav className={landingStyles.nav} aria-label="Main">
            <Link to="/#features" className={landingStyles.navLink}>
              Features
            </Link>
            <Link to="/pricing" className={landingStyles.navLink}>
              Pricing
            </Link>
            <Link to="/blog" className={landingStyles.navLink}>
              Guides
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
              <a
                href={SHOPIFY_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={landingStyles.btnPrimary}
                onClick={() =>
                  trackShopifyAppStoreClick("pricing_header", "Add to Shopify")
                }
              >
                Claim {BETA_LAUNCH_GENERATION_CAP} free
              </a>
            )}
          </div>
        </header>
      </div>

      <main>
        <section className={styles.section}>
          <div className={styles.launchBanner}>
            <p className={styles.launchEyebrow}>Launch offer</p>
            <h1 className={styles.pageTitle}>
              Start with {BETA_LAUNCH_GENERATION_CAP} launch generations
            </h1>
            <p className={styles.subtitle}>
              Install Tiny Lemon, test it with real Shopify products, and only
              upgrade when you are ready for more catalog volume, high-resolution
              exports, short product videos, and expanded brand workflows.
            </p>
            <a
              href={SHOPIFY_APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.launchCta}
              onClick={() => {
                trackMarketingEvent("pricing_cta_clicked", {
                  plan: "beta_launch",
                  source: "pricing_hero",
                });
                trackShopifyAppStoreClick(
                  "pricing_hero",
                  `Claim ${BETA_LAUNCH_GENERATION_CAP} launch generations`,
                  { plan: "beta_launch" },
                );
              }}
            >
              Claim {BETA_LAUNCH_GENERATION_CAP} launch generations
            </a>
            <p className={styles.launchFinePrint}>
              No credit card required. Launch access is available for early
              Shopify fashion merchants while the program is open. It raises the
              Free plan from {FREE_PLAN_GENERATION_LIMIT} to{" "}
              {BETA_LAUNCH_GENERATION_CAP} generations during the program.
              Short product videos are included during launch, and each new or
              regenerated video uses 1 generation.
            </p>
          </div>

          <h2 className={styles.planSectionTitle}>Upgrade when production needs grow</h2>
          <p className={styles.subtitle}>
            Start with launch access to test real products. Move to Growth or
            Scale when you need high-resolution exports, no watermark, more saved
            models, brand styles, priority generation, or more catalog volume.
          </p>

          <div className={styles.tiers}>
            {/* FREE */}
            <div className={styles.tierCard}>
              <div className={styles.tierCardHeader}>
                <h2 className={styles.tierName}>Free</h2>
              </div>
              <p className={styles.tierTagline}>
                For light testing before you need more catalog volume.
              </p>
              <p className={styles.tierPriceAmount}>
                $0<span className={styles.unit}>/mo</span>
              </p>
              <a
                href={SHOPIFY_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tierCta}
                onClick={() => {
                  trackMarketingEvent("pricing_cta_clicked", {
                    plan: "free",
                    source: "pricing_tier",
                  });
                  trackShopifyAppStoreClick("pricing_tier", "Add to Shopify", {
                    plan: "free",
                  });
                }}
              >
                Claim launch access →
              </a>
              <ul className={styles.tierList}>
                <li>{FREE_PLAN_GENERATION_LIMIT} outfit generations/month</li>
                <li>Launch access raises this to {BETA_LAUNCH_GENERATION_CAP}</li>
                <li>1 model save</li>
                <li>Full 3-angle set (Front + 3/4 + Back)</li>
                <li>Launch video generation included</li>
                <li>White studio background</li>
                <li>Standard resolution (512px)</li>
                <li>Watermarked downloads</li>
              </ul>
              <div className={styles.tierCardFooter}>
                <a href="#compare-plans" className={styles.seeAllFeatures}>
                  See all features →
                </a>
              </div>
            </div>

            {/* GROWTH */}
            <div className={`${styles.tierCard} ${styles.featured}`}>
              <div className={styles.tierCardHeader}>
                <h2 className={styles.tierName}>Growth</h2>
                <span className={styles.tierBadge}>Most popular</span>
              </div>
              <p className={styles.tierTagline}>
                For brands running seasonal drops. Full structural + quality
                set.
              </p>
              <p className={styles.tierPriceAmount}>
                ~$99<span className={styles.unit}>/mo</span>
              </p>
              <a
                href={SHOPIFY_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tierCta}
                onClick={() => {
                  trackMarketingEvent("pricing_cta_clicked", {
                    plan: "growth",
                    source: "pricing_tier",
                  });
                  trackShopifyAppStoreClick("pricing_tier", "Add to Shopify", {
                    plan: "growth",
                  });
                }}
              >
                Add to Shopify →
              </a>
              <ul className={styles.tierList}>
                <li>100 outfit generations/month</li>
                <li>10 model saves</li>
                <li>3-angle + Detail close-up + Flat lay</li>
                <li>Launch video generation included</li>
                <li>2 brand style profiles</li>
                <li>Priority generation queue</li>
                <li>High-resolution (1K, 2:3)</li>
              </ul>
              <div className={styles.tierCardFooter}>
                <a href="#compare-plans" className={styles.seeAllFeatures}>
                  See all features →
                </a>
              </div>
            </div>

            {/* SCALE */}
            <div className={styles.tierCard}>
              <div className={styles.tierCardHeader}>
                <h2 className={styles.tierName}>Scale</h2>
              </div>
              <p className={styles.tierTagline}>
                For brands running 50+ SKUs/season or multiple collections.
              </p>
              <p className={styles.tierPriceAmount}>
                ~$249<span className={styles.unit}>/mo</span>
              </p>
              <a
                href={SHOPIFY_APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.tierCta}
                onClick={() => {
                  trackMarketingEvent("pricing_cta_clicked", {
                    plan: "scale",
                    source: "pricing_tier",
                  });
                  trackShopifyAppStoreClick("pricing_tier", "Add to Shopify", {
                    plan: "scale",
                  });
                }}
              >
                Add to Shopify →
              </a>
              <ul className={styles.tierList}>
                <li>300 outfit generations/month</li>
                <li>Unlimited model saves</li>
                <li>Full set + Lifestyle imagery</li>
                <li>Launch video generation included</li>
                <li>Unlimited brand profiles</li>
                <li>Credit rollover (up to 1 month)</li>
                <li>Priority queue + early access</li>
              </ul>
              <div className={styles.tierCardFooter}>
                <a href="#compare-plans" className={styles.seeAllFeatures}>
                  See all features →
                </a>
              </div>
            </div>
          </div>

          <div
            id="compare-plans"
            className={`${styles.compareSection} ${styles.compareAnchor}`}
          >
            <h2 className={styles.tableSectionTitle}>Compare plans</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Launch / Free</th>
                  <th>Growth</th>
                  <th>Scale</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Monthly generations</td>
                  <td>{BETA_LAUNCH_GENERATION_CAP} during launch, then {FREE_PLAN_GENERATION_LIMIT}/month</td>
                  <td>100/month</td>
                  <td>300/month</td>
                </tr>
                <tr>
                  <td>Best for</td>
                  <td>Testing real products before choosing a paid plan</td>
                  <td>Production catalog drops and seasonal launches</td>
                  <td>Large catalogs, multiple collections, and higher volume</td>
                </tr>
                <tr>
                  <td>Downloads</td>
                  <td>Standard resolution with watermark</td>
                  <td>High-resolution, unwatermarked exports</td>
                  <td>High-resolution, unwatermarked exports</td>
                </tr>
                <tr>
                  <td>Creative formats</td>
                  <td>AI model photos and short product videos during launch</td>
                  <td>Model photos, detail close-ups, flat lays, and launch videos</td>
                  <td>Full set, lifestyle imagery, and launch videos</td>
                </tr>
                <tr>
                  <td>Saved models / brand setup</td>
                  <td>1</td>
                  <td>10 saved models + 2 brand profiles</td>
                  <td>Unlimited saved models + unlimited brand profiles</td>
                </tr>
                <tr>
                  <td>Price</td>
                  <td>Free</td>
                  <td>~$99/mo</td>
                  <td>~$249/mo</td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>

          <div className={styles.savings}>
            <strong>Savings vs. traditional shoot:</strong> For a small brand
            with 10 new SKUs per drop, a typical shoot runs $800–$1,500 per
            session. Growth is built for production catalog drops that need
            high-resolution, unwatermarked output without booking a shoot. At scale, a
            traditional shoot day runs $500–$2,000 (studio + photographer +
            model + retouching). For 50 SKUs/season at 8 images each, that&apos;s
            $12,000–$18,000/year. Scale tier annual cost: $2,988 — roughly
            $10,000–$15,000 saved per year.
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
              Beautiful product photos in minutes. For fashion brands on
              Shopify.
            </p>
          </div>
          <div className={landingStyles.footerColumns}>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Product</h3>
              <Link
                to="/try"
                className={landingStyles.footerLink}
                onClick={() => trackTryDemoClick("pricing_footer")}
              >
                View demo
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
                Guides
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

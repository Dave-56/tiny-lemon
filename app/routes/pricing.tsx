import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

import { login } from "../shopify.server";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/pricing.module.css";

export const meta: MetaFunction = () => {
  const title = "Pricing — TinyLemon";
  const description =
    "Pricing tiers for TinyLemon: from free trial to scale. Beautiful product photos for fashion brands on Shopify.";
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

export default function PricingPage() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={landingStyles.page}>
      <div className={landingStyles.headerWrapper}>
        <header className={landingStyles.header}>
          <Link to="/" className={landingStyles.logo}>
            TinyLemon
          </Link>
          <nav className={landingStyles.nav} aria-label="Main">
            <Link to="/features" className={landingStyles.navLink}>
              Features
            </Link>
            <Link to="/pricing" className={landingStyles.navLink}>
              Pricing
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
          <h1 className={styles.pageTitle}>Pricing Tiers</h1>
          <p className={styles.subtitle}>
            From free trial to scale. The framework: structural angles first,
            then detail and flat lay, then lifestyle. Each tier unlocks the
            next layer of the image set.
          </p>

          <div className={styles.tiers}>
            {/* FREE */}
            <div className={styles.tierCard}>
              <h2 className={styles.tierName}>Free</h2>
              <p className={styles.tierPrice}>
                Try before you commit. No credit card.
              </p>
              <h3 className={styles.tierHeading}>What&apos;s included</h3>
              <ul className={styles.tierList}>
                <li>3 outfit generations per month (non-rollover)</li>
                <li>1 model save</li>
                <li>Front hero angle only (no 3/4, no back)</li>
                <li>White studio background only</li>
                <li>Standard resolution (512px output)</li>
                <li>Watermarked downloads</li>
                <li>Community support only</li>
              </ul>
              <h3 className={styles.tierHeading}>What&apos;s locked</h3>
              <ul className={`${styles.tierList} ${styles.locked}`}>
                <li>Three-angle structural set (3/4 + back)</li>
                <li>Detail close-ups</li>
                <li>Flat lay</li>
                <li>Lifestyle images</li>
                <li>Multiple models</li>
                <li>High-res output</li>
              </ul>
              <p className={styles.tierPitch}>
                Prove the output quality. One generation = one SKU front shot.
                Enough to see it works, not enough to run a catalog on.
              </p>
            </div>

            {/* STARTER */}
            <div className={styles.tierCard}>
              <h2 className={styles.tierName}>Starter</h2>
              <p className={styles.tierPrice}>~$39/month</p>
              <p className={styles.tierPrice}>
                For brands launching their first collection or testing the
                workflow.
              </p>
              <h3 className={styles.tierHeading}>What&apos;s included</h3>
              <ul className={styles.tierList}>
                <li>30 outfit generations/month (~10 SKUs at 3 angles each)</li>
                <li>3 model saves</li>
                <li>
                  Full 3-angle structural set: Front + Three-Quarter + Back
                </li>
                <li>White + Grey studio backgrounds</li>
                <li>High-resolution output (1K, 2:3)</li>
                <li>Unwatermarked downloads</li>
                <li>1 active brand style profile</li>
              </ul>
              <h3 className={styles.tierHeading}>What&apos;s locked</h3>
              <ul className={`${styles.tierList} ${styles.locked}`}>
                <li>Detail close-up generation</li>
                <li>Flat lay output</li>
                <li>Lifestyle imagery</li>
                <li>Multiple brand profiles</li>
              </ul>
              <p className={styles.tierPitch}>
                This is the minimum viable PDP set. Front + 3/4 + Back removes
                the three core purchase doubts (silhouette, drape, rear fit).
                Enough to launch a Shopify store and look like a real brand.
              </p>
              <p className={styles.tierNote}>
                Unit economics: ~$1.30/outfit at full usage.
              </p>
            </div>

            {/* GROWTH */}
            <div className={`${styles.tierCard} ${styles.featured}`}>
              <h2 className={styles.tierName}>Growth</h2>
              <p className={styles.tierPrice}>~$99/month</p>
              <p className={styles.tierPrice}>
                For brands actively running seasonal drops. The full structural
                + quality set.
              </p>
              <h3 className={styles.tierHeading}>What&apos;s included</h3>
              <ul className={styles.tierList}>
                <li>100 outfit generations/month (~20 SKUs at 5 images each)</li>
                <li>10 model saves</li>
                <li>
                  Full 3-angle structural set: Front + Three-Quarter + Back
                </li>
                <li>
                  <strong>Detail close-up generation</strong> (4th image)
                </li>
                <li>
                  <strong>Flat lay output</strong> (5th image)
                </li>
                <li>White, Grey, and Off-white studio backgrounds</li>
                <li>High-resolution output (1K, 2:3)</li>
                <li>2 active brand style profiles</li>
                <li>Priority generation queue</li>
              </ul>
              <h3 className={styles.tierHeading}>What&apos;s locked</h3>
              <ul className={`${styles.tierList} ${styles.locked}`}>
                <li>Lifestyle imagery</li>
                <li>Model diversity / multiple model looks per SKU</li>
                <li>API access</li>
              </ul>
              <p className={styles.tierPitch}>
                This is the 5-image set. Covers everything a Shopify PDP needs
                to outperform a competitor using flat lays. Detail close-ups
                remove quality doubt — the last trust gap before checkout.
              </p>
              <p className={styles.tierNote}>
                Unit economics: ~$1.00/outfit at full usage.
              </p>
            </div>

            {/* SCALE */}
            <div className={styles.tierCard}>
              <h2 className={styles.tierName}>Scale</h2>
              <p className={styles.tierPrice}>~$249/month</p>
              <p className={styles.tierPrice}>
                For brands running 50+ SKUs/season or managing multiple
                collections.
              </p>
              <h3 className={styles.tierHeading}>What&apos;s included</h3>
              <ul className={styles.tierList}>
                <li>
                  300 outfit generations/month (~37 SKUs at full 8-image set)
                </li>
                <li>Unlimited model saves</li>
                <li>Full 3-angle structural set + Detail + Flat lay</li>
                <li>
                  <strong>Lifestyle image generation</strong> (6th/7th image)
                </li>
                <li>All background options incl. custom background prompt</li>
                <li>High-resolution output (1K, 2:3)</li>
                <li>Unlimited brand style profiles</li>
                <li>Rollover unused credits (up to 1 month)</li>
                <li>Priority queue + early access to new features</li>
              </ul>
              <h3 className={styles.tierHeading}>What&apos;s locked</h3>
              <ul className={`${styles.tierList} ${styles.locked}`}>
                <li>API access (see Agency)</li>
              </ul>
              <p className={styles.tierPitch}>
                The full 8-image set. Matches what the top 25 fashion brands
                average per product. Lifestyle imagery is the retention and
                brand-building layer.
              </p>
              <p className={styles.tierNote}>
                Unit economics: ~$0.83/outfit at full usage.
              </p>
            </div>

            {/* AGENCY */}
            <div className={styles.tierCard}>
              <h2 className={styles.tierName}>Agency</h2>
              <p className={styles.tierPrice}>Custom pricing</p>
              <p className={styles.tierPrice}>
                For studios, agencies, or brands managing multiple Shopify
                stores.
              </p>
              <h3 className={styles.tierHeading}>What&apos;s included</h3>
              <ul className={styles.tierList}>
                <li>Custom generation volume</li>
                <li>All Scale features</li>
                <li>API access for direct integration into studio workflows</li>
                <li>Multiple workspace/client management</li>
                <li>Dedicated account support</li>
                <li>SLA for generation uptime</li>
                <li>Custom model and brand style profile libraries</li>
              </ul>
              <p className={styles.tierPitch}>
                White-label your workflow. Run TinyLemon as the engine inside
                your client delivery.
              </p>
            </div>
          </div>

          <h2 className={styles.tableSectionTitle}>Compare plans</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th>Starter</th>
                  <th>Growth</th>
                  <th>Scale</th>
                  <th>Agency</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Generations/month</td>
                  <td>3</td>
                  <td>30</td>
                  <td>100</td>
                  <td>300</td>
                  <td>Custom</td>
                </tr>
                <tr>
                  <td>Model saves</td>
                  <td>1</td>
                  <td>3</td>
                  <td>10</td>
                  <td>Unlimited</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>Front hero</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Three-quarter (45°)</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Back view</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Detail close-up</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Flat lay output</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Lifestyle image</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Multi background</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Brand style profiles</td>
                  <td>1</td>
                  <td>1</td>
                  <td>2</td>
                  <td>Unlimited</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td>High-res output</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Watermark</td>
                  <td className={styles.yes}>Yes</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                </tr>
                <tr>
                  <td>API access</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.no}>—</td>
                  <td className={styles.yes}>Yes</td>
                </tr>
                <tr>
                  <td>Price</td>
                  <td>Free</td>
                  <td>~$39/mo</td>
                  <td>~$99/mo</td>
                  <td>~$249/mo</td>
                  <td>Custom</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.savings}>
            <strong>Savings vs. traditional shoot:</strong> A traditional
            photoshoot day runs $500–$2,000 (studio + photographer + model +
            retouching). For 50 SKUs/season at 8 images each, that&apos;s
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
                <Link to="/features" className={landingStyles.footerLink}>
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

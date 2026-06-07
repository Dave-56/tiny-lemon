import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Link, useLoaderData } from "react-router";

import { BeforeAfterSlider } from "../../components/BeforeAfterSlider";
import { SHOPIFY_APP_STORE_URL } from "../../lib/shopifyAppStoreUrl";
import { SITE_URL, buildSeoMeta } from "../../lib/seo";
import { BETA_LAUNCH_GENERATION_CAP } from "../../lib/planConstants";
import {
  trackShopifyAppStoreClick,
  trackTryDemoClick,
} from "../../lib/marketingAnalytics";

import styles from "./styles.module.css";

const LANDING_1 = { before: "/landing-before.png", after: "/landing-after.png" };
const LANDING_2 = {
  before: "/landing-before-1.png",
  after: "/landing-after-1.png",
};

const FAQ_ITEMS = [
  {
    question: "Is Tiny Lemon a Shopify app?",
    answer:
      "Yes. Tiny Lemon is a Shopify app for fashion stores that turns flat-lay and supplier photos into AI model photos and short product videos for Shopify product listings.",
  },
  {
    question: "What does Tiny Lemon do?",
    answer:
      "Tiny Lemon helps Shopify clothing stores turn flat-lay or supplier product photos into on-model product photos and short product videos without booking a photographer, model, or studio shoot.",
  },
  {
    question: "Can I try Tiny Lemon for free?",
    answer: `Yes. With launch access, eligible early Shopify fashion merchants can get up to ${BETA_LAUNCH_GENERATION_CAP} free outfit generations to test Tiny Lemon with real products before choosing a paid plan.`,
  },
];

function getStructuredData(origin: string, installUrl: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#software`,
        name: "Tiny Lemon",
        alternateName: "TinyLemon",
        applicationCategory: "Shopify app / ecommerce product photography",
        applicationSubCategory: "AI model photos and product videos",
        operatingSystem: "Shopify",
        url: origin,
        downloadUrl: installUrl,
        sameAs: [installUrl],
        description:
          "Tiny Lemon is a Shopify app for fashion stores that turns flat-lay and supplier photos into AI model photos and short product videos for Shopify product listings.",
        featureList: [
          "AI model photos from flat-lay and supplier product photos",
          "Short product videos for fashion product listings",
          `Launch access with up to ${BETA_LAUNCH_GENERATION_CAP} free outfit generations`,
          "Shopify product media workflow for clothing stores",
        ],
        offers: {
          "@type": "Offer",
          url: installUrl,
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${origin}/#faq`,
        mainEntity: FAQ_ITEMS.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = "Tiny Lemon Shopify App for AI Model Photos & Video";
  const description =
    `Tiny Lemon turns flat-lay and supplier photos into AI model photos and short product videos for Shopify fashion listings. Early merchants can get up to ${BETA_LAUNCH_GENERATION_CAP} free launch generations.`;
  const installUrl = data?.installUrl ?? SHOPIFY_APP_STORE_URL;
  return buildSeoMeta({
    title,
    description,
    path: "/",
    extra: [{ "script:ld+json": getStructuredData(SITE_URL, installUrl) }],
  });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const installUrl = SHOPIFY_APP_STORE_URL;
  return { hasInstallUrl: Boolean(installUrl), installUrl };
};

export default function LandingPage() {
  const { hasInstallUrl, installUrl } = useLoaderData<typeof loader>();

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
              Guides
            </Link>
            <a href="#how-it-works" className={styles.navLink}>
              About
            </a>
            <a href="#login" className={styles.navLink}>
              Contact
            </a>
            {hasInstallUrl && (
              <a href="#login" className={styles.navLink}>
                Log in
              </a>
            )}
          </nav>
          <div className={styles.headerActions}>
            {hasInstallUrl && (
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.btnPrimary}
                onClick={() =>
                  trackShopifyAppStoreClick(
                    "home_header",
                    "Install from Shopify App Store",
                  )
                }
              >
                Claim {BETA_LAUNCH_GENERATION_CAP} free
              </a>
            )}
            <Link
              to="/try"
              className={styles.btnGhost}
              onClick={() => trackTryDemoClick("home_header")}
            >
              View demo
            </Link>
          </div>
        </header>
      </div>

      <main>
        <section className={styles.hero}>
          <h1 className={styles.heroHeadline}>
            Studio shots in 60 seconds. No shoot.
          </h1>
          <p className={styles.heroSubhead}>
            Upload a flat-lay from your factory or your own shoot. Get
            professional on-model photos and a short branded product video,
            then publish them directly to your Shopify listing. No photographer,
            no shoot budget.
          </p>
          <p
            className={styles.heroOffer}
            aria-label={`Get up to ${BETA_LAUNCH_GENERATION_CAP} free outfit generations with launch access.`}
          >
            <span>Get up to </span>
            <strong>{BETA_LAUNCH_GENERATION_CAP} free outfit generations</strong>
            <span> with launch access.</span>
          </p>
          <p className={styles.heroAppStoreNote}>
            No credit card. Test with real products before choosing a paid plan.
          </p>
          <div className={styles.heroCtas}>
            {hasInstallUrl && (
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.heroCta}
                onClick={() =>
                  trackShopifyAppStoreClick(
                    "home_hero",
                    "Install from Shopify App Store",
                  )
                }
              >
                Claim {BETA_LAUNCH_GENERATION_CAP} free generations
              </a>
            )}
            <Link
              to="/try"
              className={styles.heroCtaSecondary}
              onClick={() => trackTryDemoClick("home_hero")}
            >
              View demo
            </Link>
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
              <span>Upload your flat-lay from your factory, supplier, or your own shoot</span>
            </li>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>2</span>
              <span>Generate on-model photos plus a short branded product video</span>
            </li>
            <li className={styles.howItWorksItem}>
              <span className={styles.howItWorksStep}>3</span>
              <span>Publish the assets directly to your Shopify listing</span>
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
                Install Tiny Lemon from the Shopify App Store to generate images in the app and add them directly to your Shopify products. No export, no manual uploads, same look every time.
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
                alt="Multiple product media types: on-model angles, detail close-ups, flat lay, and lifestyle"
                className={styles.featureCardImage}
                width={1600}
                height={900}
              />
              <div className={styles.featureCardIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </div>
              <h3 className={styles.featureCardTitle}>Every product asset your listing needs</h3>
              <p className={styles.featureCardDesc}>
                On-model front, side, and back views, detail close-ups, flat lay, lifestyle, and short branded product video. Build more PDP, Reels, and TikTok creative from one flat-lay.
              </p>
            </div>
          </div>
        </section>

        <section id="faq" className={styles.faqSection}>
          <h2 className={styles.faqTitle}>FAQ</h2>
          <dl className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <div className={styles.faqItem} key={item.question}>
                <dt className={styles.faqQuestion}>{item.question}</dt>
                <dd className={styles.faqAnswer}>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="login" className={styles.loginSection}>
          <h2 className={styles.loginTitle}>Add Tiny Lemon to Shopify</h2>
          {hasInstallUrl ? (
            <>
              <p className={styles.loginSubtext}>
                Install Tiny Lemon from the Shopify App Store to claim up to{" "}
                {BETA_LAUNCH_GENERATION_CAP} free launch generations and create
                AI model photos plus short product videos directly inside Shopify.
              </p>
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.loginPrimaryCta}
                onClick={() =>
                  trackShopifyAppStoreClick(
                    "home_login_section",
                    "Add the app to my store",
                  )
                }
              >
                Claim {BETA_LAUNCH_GENERATION_CAP} free generations
              </a>
              <p className={styles.loginDivider}>
                Already installed? Open Tiny Lemon from your Shopify admin under Apps.
              </p>
            </>
          ) : (
            <>
              <p className={styles.loginSubtext}>
                Tiny Lemon is coming soon to the Shopify App Store. Want to try
                it now? Use the free demo — no install needed.
              </p>
              <Link
                to="/try"
                className={styles.loginPrimaryCta}
                onClick={() => trackTryDemoClick("home_login_section")}
              >
                View demo
              </Link>
              <p className={styles.loginDivider}>
                Already installed? Open Tiny Lemon from your Shopify admin under Apps.
              </p>
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
              <Link
                to="/try"
                className={styles.footerLink}
                onClick={() => trackTryDemoClick("home_footer")}
              >
                View demo
              </Link>
              <a href="#features" className={styles.footerLink}>
                Features
              </a>
              <a
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.footerLink}
                onClick={() =>
                  trackShopifyAppStoreClick(
                    "home_footer",
                    "Shopify App Store listing",
                  )
                }
              >
                Shopify App Store listing
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
                Guides
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

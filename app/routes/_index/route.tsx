import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { BeforeAfterSlider } from "../../components/BeforeAfterSlider";

import styles from "./styles.module.css";

const LANDING_BEFORE_IMAGE =
  "https://placehold.co/800x600/f5f5f5/999?text=Flat+lay";
const LANDING_AFTER_IMAGE =
  "https://placehold.co/800x600/eee/555?text=Studio+shot";

export const meta: MetaFunction = () => {
  const title = "Tiny Lemon — Studio shots from flat-lays in 60 seconds";
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
      <header className={styles.header}>
        <a href="/" className={styles.logo}>
          Tiny Lemon
        </a>
        <nav className={styles.nav}>
          {showForm && (
            <a href="#login" className={styles.navLink}>
              Log in
            </a>
          )}
        </nav>
        {showForm && (
          <div className={styles.headerActions}>
            <a href="#login" className={styles.btnGhost}>
              Get started
            </a>
            <a href="#login" className={styles.btnPrimary}>
              Log in
            </a>
          </div>
        )}
      </header>

      <main>
        <section className={styles.hero}>
          <p className={styles.heroLabel}>For Shopify fashion brands</p>
          <h1 className={styles.heroHeadline}>
            Studio shots in 60 seconds. No shoot.
          </h1>
          <p className={styles.heroSubhead}>
            Turn flat-lays into consistent, on-model photos. Same look every
            time—built for your Shopify store. No photographer, no $15K
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
          <BeforeAfterSlider
            beforeImage={LANDING_BEFORE_IMAGE}
            afterImage={LANDING_AFTER_IMAGE}
            beforeLabel="Flat lay"
            afterLabel="Studio shot"
          />
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

        <section className={styles.features}>
          <div className={styles.featureCard}>
            <h2 className={styles.featureTitle}>
              One consistent look across your catalog
            </h2>
            <p className={styles.featureDesc}>
              Same model, same background—so every product fits the same brand
              look. Garment-accurate output that’s ready for your store. No
              waiting weeks for a shoot.
            </p>
            <ul className={styles.featureList}>
              <li>Studio-quality angles in minutes, not weeks</li>
              <li>Built for Shopify—generate and add to your products</li>
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
        <a href="/privacy" className={styles.footerLink}>
          Privacy
        </a>
        <a href="/terms" className={styles.footerLink}>
          Terms
        </a>
      </footer>
    </div>
  );
}

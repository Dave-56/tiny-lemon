import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

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
            Turn flat-lays into studio shots in 60 seconds.
          </h1>
          <p className={styles.heroSubhead}>
            No photographer. No model. No $15K photoshoot. Get front, 3/4, and
            back angles for your Shopify store in minutes.
          </p>
          {showForm && (
            <a href="#login" className={styles.heroCta}>
              Get started
            </a>
          )}
        </section>

        <section className={styles.features}>
          <div className={styles.featureCard}>
            <h2 className={styles.featureTitle}>
              Professional product photos
            </h2>
            <p className={styles.featureDesc}>
              Upload your flat-lay images and get high-end studio shots with
              front, three-quarter, and back angles. Same model, same
              background—consistent enough to build a real catalog. No
              photoshoot, no waiting weeks.
            </p>
            <ul className={styles.featureList}>
              <li>Studio-quality angles in minutes, not weeks</li>
              <li>Garment-accurate output that looks like a real brand</li>
              <li>Built for Shopify—generate and add to your products</li>
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

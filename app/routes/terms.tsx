import { Link } from "react-router";
import styles from "../styles/legal.module.css";

export default function Terms() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>
          Tiny Lemon
        </Link>
      </header>

      <main className={styles.main}>
        <Link to="/" className={styles.backLink}>
          ← Back to home
        </Link>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.updated}>Last updated: March 2025</p>

        <div className={styles.content}>
          <p>
            By installing or using the Tiny Lemon app (&quot;App&quot;) on your Shopify
            store, you agree to these Terms of Service.
          </p>

          <h2>Use of the App</h2>
          <p>
            You may use the App only in accordance with Shopify&apos;s terms and
            policies and our documentation. You are responsible for the content
            you upload and the images you generate and publish.
          </p>

          <h2>Billing</h2>
          <p>
            Subscription and usage charges are billed through the Shopify Billing
            API. By starting a paid plan, you agree to the pricing and billing
            terms presented in the app and in the Shopify App Store listing.
          </p>

          <h2>Acceptable use</h2>
          <p>
            You may not use the App to generate or distribute content that is
            illegal, infringing, or that violates Shopify&apos;s Acceptable Use
            Policy. We may suspend or terminate access for misuse.
          </p>

          <h2>Disclaimer</h2>
          <p>
            The App and generated content are provided &quot;as is&quot;. We do not
            guarantee uninterrupted service or specific results. Use of AI-generated
            imagery is at your own risk.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these terms from time to time. Continued use of the App
            after changes constitutes acceptance. The &quot;Last updated&quot; date
            above indicates when the terms were last revised.
          </p>

          <h2>Contact</h2>
          <p>
            For questions about these terms, contact us using the support or
            contact details provided in the app or in the Shopify App Store
            listing.
          </p>
        </div>
      </main>

      <footer className={styles.footer}>
        <Link to="/" className={styles.footerLink}>
          Home
        </Link>
        <Link to="/privacy" className={styles.footerLink}>
          Privacy
        </Link>
        <Link to="/terms" className={styles.footerLink}>
          Terms
        </Link>
      </footer>
    </div>
  );
}

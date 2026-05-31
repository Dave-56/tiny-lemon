import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { buildSeoMeta } from "../lib/seo";
import styles from "../styles/legal.module.css";

export const meta: MetaFunction = () =>
  buildSeoMeta({
    title: "Terms of Service | TinyLemon",
    description:
      "TinyLemon terms of service for Shopify merchants using the AI product photography app.",
    path: "/terms",
  });

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

          <h2>Merchant account and store access</h2>
          <p>
            The App is intended for merchants and team members who are authorized
            to manage a Shopify store. You are responsible for maintaining access
            to your Shopify account, controlling which staff members can use the
            App, and ensuring that product images and store data are handled
            according to your own business policies.
          </p>

          <h2>Use of the App</h2>
          <p>
            You may use the App only in accordance with Shopify&apos;s terms and
            policies and our documentation. You are responsible for the content
            you upload and the images you generate and publish.
          </p>

          <h2>Uploaded and generated content</h2>
          <p>
            You represent that you have the rights needed to upload product
            photos, reference images, brand assets, and related materials to the
            App. You are responsible for reviewing AI-generated images before
            publishing them to confirm that they accurately represent your
            products, comply with applicable laws, and do not infringe third-party
            rights.
          </p>

          <h2>AI output and product accuracy</h2>
          <p>
            Tiny Lemon is designed to help create product imagery more quickly,
            but AI-generated output may contain mistakes, artifacts, or visual
            differences from the source product. You should not publish generated
            images that materially misrepresent garment color, construction,
            fit, labeling, texture, or other important product details.
          </p>

          <h2>Billing</h2>
          <p>
            Subscription and usage charges are billed through the Shopify Billing
            API. By starting a paid plan, you agree to the pricing and billing
            terms presented in the app and in the Shopify App Store listing.
          </p>

          <h2>Third-party services</h2>
          <p>
            The App may rely on Shopify APIs, hosting providers, AI model
            providers, analytics tools, storage services, and other vendors to
            operate the service. Your use of Shopify remains governed by
            Shopify&apos;s own terms, policies, and platform requirements.
          </p>

          <h2>Acceptable use</h2>
          <p>
            You may not use the App to generate or distribute content that is
            illegal, infringing, or that violates Shopify&apos;s Acceptable Use
            Policy. We may suspend or terminate access for misuse.
          </p>

          <h2>Service changes and availability</h2>
          <p>
            We may update, improve, limit, or discontinue parts of the App over
            time. We aim to keep the service reliable, but availability can be
            affected by maintenance, third-party outages, rate limits, network
            issues, or events outside our control.
          </p>

          <h2>Disclaimer</h2>
          <p>
            The App and generated content are provided &quot;as is&quot;. We do not
            guarantee uninterrupted service or specific results. Use of AI-generated
            imagery is at your own risk.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Tiny Lemon will not be liable
            for indirect, incidental, special, consequential, or punitive damages,
            or for lost profits, lost revenue, lost data, or business interruption
            arising from your use of the App.
          </p>

          <h2>Termination</h2>
          <p>
            You may stop using the App at any time by uninstalling it from your
            Shopify store. We may suspend or terminate access if we believe your
            use violates these terms, creates risk for the service, or violates
            Shopify platform requirements.
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

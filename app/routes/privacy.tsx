import { Link } from "react-router";
import styles from "./legal.module.css";

export default function Privacy() {
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
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last updated: March 2025</p>

        <div className={styles.content}>
          <p>
            Tiny Lemon (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) operates the Tiny Lemon
            Shopify app. This policy describes how we collect, use, and protect
            information when merchants use our app.
          </p>

          <h2>Contact</h2>
          <p>
            If you have questions about this privacy policy or your data, please
            contact us at the email address you provide in your Shopify App Store
            listing or in your app settings.
          </p>

          <h2>Information we collect</h2>
          <p>
            We collect and process information necessary to provide the Tiny Lemon
            app:
          </p>
          <ul>
            <li>
              <strong>From merchants:</strong> Shopify store domain, account and
              subscription information provided via the Shopify Billing API, and
              usage of the app (e.g. generations, saved outfits, brand style
              preferences).
            </li>
            <li>
              <strong>Via Shopify APIs:</strong> Data we receive through Shopify
              (e.g. shop details, product-related data when you use app features
              that interact with your store).
            </li>
            <li>
              <strong>Generated content:</strong> Images you upload (e.g. flat-lay
              photos) and AI-generated images we create and store to deliver the
              service.
            </li>
          </ul>

          <h2>How we use information</h2>
          <p>
            We use the information to operate the app (e.g. run AI generation,
            store outfits and images, manage billing and credits), improve our
            service, and comply with legal obligations. We do not sell your
            personal information.
          </p>

          <h2>Data retention</h2>
          <p>
            We retain your data for as long as your store has the app installed
            and as needed to provide the service and comply with law. When you
            uninstall the app or request deletion, we delete or anonymize your data
            in line with our obligations (including Shopify compliance webhooks).
          </p>

          <h2>Data location</h2>
          <p>
            Our systems and service providers may store and process data in the
            United States and other countries. If you are in the European Economic
            Area or UK, we ensure appropriate safeguards where required.
          </p>

          <h2>Your rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct,
            delete, or restrict processing of your personal data. Contact us using
            the details above to exercise these rights.
          </p>

          <h2>Changes</h2>
          <p>
            We may update this privacy policy from time to time. We will post the
            updated version on this page and update the &quot;Last updated&quot; date.
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

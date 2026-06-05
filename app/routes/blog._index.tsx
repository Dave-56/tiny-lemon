import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

import { getBlogPosts } from "../lib/blog.server";
import { SHOPIFY_APP_STORE_URL } from "../lib/shopifyAppStoreUrl";
import { buildSeoMeta } from "../lib/seo";
import {
  trackShopifyAppStoreClick,
  trackTryDemoClick,
} from "../lib/marketingAnalytics";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/blog.module.css";

export const meta: MetaFunction = () => {
  const title = "Shopify AI Photo Guides — TinyLemon";
  const description =
    "Guides for Shopify fashion brands using AI product photography, model photos, and better product page imagery.";
  return buildSeoMeta({ title, description, path: "/blog" });
};

export const loader = async (_args: LoaderFunctionArgs) => {
  const posts = getBlogPosts();
  return { posts, showForm: Boolean(SHOPIFY_APP_STORE_URL) };
};

function formatGuideDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(date);
  return parsedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndexPage() {
  const { posts, showForm } = useLoaderData<typeof loader>();

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
                  trackShopifyAppStoreClick("blog_index_header", "Add to Shopify")
                }
              >
                Add to Shopify
              </a>
            )}
          </div>
        </header>
      </div>

      <main>
        <section className={styles.section}>
          <h1 className={styles.pageTitle}>Shopify AI Photo Guides</h1>
          <p className={styles.subtitle}>
            Practical guides for fashion brands using AI product photography,
            on-model images, and better Shopify product pages.
          </p>
          <section className={styles.introCopy} aria-label="About TinyLemon guides">
            <p>
              TinyLemon guides focus on one practical problem for Shopify fashion
              merchants: creating product photos that help shoppers understand
              fit, fabric, silhouette, and brand style without slowing every
              launch down with a new photoshoot.
            </p>
            <p>
              The articles cover flat-lay to studio-shot workflows, ghost
              mannequin alternatives, AI model photos, catalog consistency, and
              the product-page image decisions that matter most for apparel
              stores. Each guide is written for small ecommerce teams that need
              repeatable product photography systems, not abstract creative
              theory.
            </p>
          </section>
          <ul className={styles.postList}>
            {posts.map((post) => (
              <li key={post.slug}>
                <Link to={`/blog/${post.slug}`} className={styles.postLink}>
                  <h2 className={styles.postTitle}>{post.title}</h2>
                  <time className={styles.postDate} dateTime={post.date}>
                    {post.date ? formatGuideDate(post.date) : ""}
                  </time>
                  {post.excerpt && (
                    <p className={styles.postExcerpt}>{post.excerpt}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
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
                onClick={() => trackTryDemoClick("blog_index_footer")}
              >
                View demo
              </Link>
              <Link to="/#features" className={landingStyles.footerLink}>
                Features
              </Link>
              <Link to="/pricing" className={landingStyles.footerLink}>
                Pricing
              </Link>
              <a href="/#login" className={landingStyles.footerLink}>
                Contact
              </a>
            </div>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Company</h3>
              <Link to="/blog" className={landingStyles.footerLink}>
                Guides
              </Link>
              <a href="/#how-it-works" className={landingStyles.footerLink}>
                About
              </a>
              <a href="/#login" className={landingStyles.footerLink}>
                Contact
              </a>
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
        </div>
      </footer>
    </div>
  );
}

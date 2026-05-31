import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

import { login } from "../shopify.server";
import { getBlogPost, getSiteBaseUrl } from "../lib/blog.server";
import { SHOPIFY_APP_STORE_URL } from "../lib/shopifyAppStoreUrl";
import { buildSeoMeta } from "../lib/seo";
import {
  trackShopifyAppStoreClick,
  trackTryDemoClick,
} from "../lib/marketingAnalytics";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/blog.module.css";

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

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.post) return [{ title: "Not found" }];
  const postTitle = data.post.subtitle
    ? `${data.post.title}: ${data.post.subtitle}`
    : data.post.title;
  const title = `${data.post.seoTitle || data.post.title} | TinyLemon`;
  const description = data.post.excerpt || postTitle;
  return buildSeoMeta({
    title,
    description,
    path: `/blog/${data.post.slug}`,
    type: "article",
    extra: [
      { property: "article:published_time", content: data.post.date },
      { property: "article:modified_time", content: data.post.updated },
    ],
  });
};

export const loader = async ({
  params,
  request,
}: LoaderFunctionArgs) => {
  const slug = params.slug;
  if (!slug || slug === "blog") {
    return Response.redirect(new URL("/blog", request.url), 302);
  }
  const post = getBlogPost(slug);
  if (!post) return Response.redirect(new URL("/blog", request.url), 302);
  const siteBaseUrl = getSiteBaseUrl(request);
  const postUrl = `${siteBaseUrl}/blog/${encodeURIComponent(post.slug)}`;
  return { post, postUrl, showForm: Boolean(login) };
};

export default function BlogPostPage() {
  const { post, postUrl, showForm } = useLoaderData<typeof loader>();
  const postTitle = post.subtitle ? `${post.title}: ${post.subtitle}` : post.title;
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: postTitle,
    description: post.excerpt || postTitle,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    mainEntityOfPage: postUrl,
    author: {
      "@type": "Organization",
      name: "TinyLemon",
    },
    publisher: {
      "@type": "Organization",
      name: "TinyLemon",
      logo: {
        "@type": "ImageObject",
        url: `${new URL(postUrl).origin}/app-icon-1200x1200.png`,
      },
    },
  };

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
                  trackShopifyAppStoreClick("blog_post_header", "Add to Shopify", {
                    slug: post.slug,
                  })
                }
              >
                Add to Shopify
              </a>
            )}
          </div>
        </header>
      </div>

      <main>
        <article className={`${styles.section} ${styles.postArticle}`}>
          <Link to="/blog" className={styles.backLink}>
            Back to Guides
          </Link>
          <header className={styles.postHeader}>
            <h1 className={styles.pageTitle}>{post.title}</h1>
            {post.subtitle && (
              <p className={styles.postSubtitle}>{post.subtitle}</p>
            )}
            {post.date && (
              <time dateTime={post.date} className={styles.postDate}>
                {formatGuideDate(post.date)}
              </time>
            )}
          </header>
          <div
            className={styles.postBody}
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
          />
        </article>
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
                onClick={() => trackTryDemoClick("blog_post_footer")}
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

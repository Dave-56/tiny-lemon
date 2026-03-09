import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";

import { login } from "../shopify.server";
import { getBlogPost } from "../lib/blog.server";

import landingStyles from "./_index/styles.module.css";
import styles from "../styles/blog.module.css";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data?.post) return [{ title: "Not found" }];
  const title = `${data.post.title} — TinyLemon Blog`;
  const description = data.post.excerpt || data.post.title;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
  ];
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
  return { post, showForm: Boolean(login) };
};

export default function BlogPostPage() {
  const { post, showForm } = useLoaderData<typeof loader>();

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
            <Link to="/try" className={landingStyles.navLink}>
              Try free
            </Link>
            <Link to="/blog" className={landingStyles.navLink}>
              Blog
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
        <article className={styles.section}>
          <Link to="/blog" className={styles.backLink}>
            ← Back to Blog
          </Link>
          <header className={styles.postHeader}>
            <h1 className={styles.pageTitle}>{post.title}</h1>
            {post.date && (
              <time dateTime={post.date} className={styles.postDate}>
                {new Date(post.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            )}
          </header>
          <div
            className={styles.postBody}
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
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
              <Link to="/features" className={landingStyles.footerLink}>
                Features
              </Link>
              <Link to="/pricing" className={landingStyles.footerLink}>
                Pricing
              </Link>
              <Link to="/try" className={landingStyles.footerLink}>
                Try free
              </Link>
              <a href="/#login" className={landingStyles.footerLink}>
                Contact
              </a>
            </div>
            <div className={landingStyles.footerCol}>
              <h3 className={landingStyles.footerHeading}>Company</h3>
              <Link to="/blog" className={landingStyles.footerLink}>
                Blog
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

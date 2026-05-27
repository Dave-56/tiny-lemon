import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const BLOG_DIR = join(ROOT, "content", "blog");
const SITE_URL = "https://tinylemon.xyz";
const BLOG_TITLE_SUFFIX = " | TinyLemon";
const MAX_FINAL_TITLE_LENGTH = 70;
const MAX_SEO_TITLE_LENGTH = 55;
const MIN_EXCERPT_LENGTH = 80;
const MAX_EXCERPT_LENGTH = 180;
const MIN_INTERNAL_LINKS = 2;

type BlogPost = {
  fileName: string;
  frontmatter: Record<string, string>;
  body: string;
};

const publicSeoRoutes = [
  { route: "/", file: "app/routes/_index/route.tsx" },
  { route: "/features", file: "app/routes/features.tsx" },
  { route: "/pricing", file: "app/routes/pricing.tsx" },
  { route: "/try", file: "app/routes/try.tsx" },
  { route: "/blog", file: "app/routes/blog._index.tsx" },
  { route: "/privacy", file: "app/routes/privacy.tsx" },
  { route: "/terms", file: "app/routes/terms.tsx" },
];

const failures: string[] = [];

function fail(message: string) {
  failures.push(message);
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2].trim() };
}

function getBlogPosts(): BlogPost[] {
  return readdirSync(BLOG_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("_"))
    .map((entry) => {
      const raw = readFileSync(join(BLOG_DIR, entry.name), "utf-8");
      const parsed = parseFrontmatter(raw);
      return { fileName: entry.name, ...parsed };
    });
}

function countInternalLinks(post: BlogPost): number {
  const links = new Set<string>();
  const slug = post.frontmatter.slug || post.fileName.replace(/\.md$/, "");
  const selfPath = `/blog/${slug}`;
  const linkPattern = /(?<!!)\[[^\]]+\]\((\/[^)#?\s]+)(?:[#?][^)]*)?\)/g;

  for (const match of post.body.matchAll(linkPattern)) {
    const path = match[1];
    if (path === selfPath) continue;
    links.add(path);
  }

  return links.size;
}

function validateBlogPosts(posts: BlogPost[]) {
  const slugs = new Set<string>();

  for (const post of posts) {
    const label = `content/blog/${post.fileName}`;
    const { title, seoTitle, slug, date, excerpt } = post.frontmatter;

    if (!title) fail(`${label}: missing title`);
    if (!seoTitle) fail(`${label}: missing seoTitle`);
    if (!slug) fail(`${label}: missing slug`);
    if (!date) fail(`${label}: missing date`);
    if (!excerpt) fail(`${label}: missing excerpt`);

    if (slug) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        fail(`${label}: slug must be lowercase kebab-case`);
      }
      if (slugs.has(slug)) fail(`${label}: duplicate slug "${slug}"`);
      slugs.add(slug);
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      fail(`${label}: date must use YYYY-MM-DD`);
    }

    if (seoTitle && seoTitle.length > MAX_SEO_TITLE_LENGTH) {
      fail(`${label}: seoTitle is ${seoTitle.length} chars; keep it <= ${MAX_SEO_TITLE_LENGTH}`);
    }

    const finalTitle = `${seoTitle || title || ""}${BLOG_TITLE_SUFFIX}`;
    if (finalTitle.length > MAX_FINAL_TITLE_LENGTH) {
      fail(`${label}: computed title is ${finalTitle.length} chars; keep it <= ${MAX_FINAL_TITLE_LENGTH}`);
    }

    if (excerpt) {
      if (excerpt.length < MIN_EXCERPT_LENGTH) {
        fail(`${label}: excerpt is ${excerpt.length} chars; keep it >= ${MIN_EXCERPT_LENGTH}`);
      }
      if (excerpt.length > MAX_EXCERPT_LENGTH) {
        fail(`${label}: excerpt is ${excerpt.length} chars; keep it <= ${MAX_EXCERPT_LENGTH}`);
      }
    }

    const internalLinkCount = countInternalLinks(post);
    if (internalLinkCount < MIN_INTERNAL_LINKS) {
      fail(`${label}: has ${internalLinkCount} internal links; add at least ${MIN_INTERNAL_LINKS}`);
    }
  }
}

function validateLlmsTxt(posts: BlogPost[]) {
  const llmsPath = join(ROOT, "public", "llms.txt");
  let llms = "";
  try {
    llms = readFileSync(llmsPath, "utf-8");
  } catch {
    fail("public/llms.txt: missing file");
    return;
  }

  const requiredUrls = [
    `${SITE_URL}/`,
    `${SITE_URL}/try`,
    `${SITE_URL}/blog`,
    `${SITE_URL}/sitemap.xml`,
    ...posts.map((post) => `${SITE_URL}/blog/${post.frontmatter.slug}`),
  ];

  for (const url of requiredUrls) {
    if (!llms.includes(url)) fail(`public/llms.txt: missing ${url}`);
  }
}

function validatePublicRouteMeta() {
  for (const route of publicSeoRoutes) {
    const label = `${route.file} (${route.route})`;
    const source = readFileSync(join(ROOT, route.file), "utf-8");

    if (!source.includes("export const meta")) {
      fail(`${label}: missing export const meta`);
    }
    if (!/{\s*title\s*[:}]/s.test(source)) {
      fail(`${label}: meta must set a title`);
    }
    if (!/name:\s*["']description["']/.test(source)) {
      fail(`${label}: meta must set a description`);
    }
    if (/["']\/auth\/login["']/.test(source)) {
      fail(`${label}: public SEO routes must not link directly to /auth/login`);
    }
  }
}

function main() {
  const posts = getBlogPosts();
  validateBlogPosts(posts);
  validateLlmsTxt(posts);
  validatePublicRouteMeta();

  if (failures.length > 0) {
    console.error("SEO content check failed:\n");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`SEO content check passed for ${posts.length} blog posts and ${publicSeoRoutes.length} routes.`);
}

main();
